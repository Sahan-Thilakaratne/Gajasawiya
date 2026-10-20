// backend/src/server.js
// Gaja Saviya Path-Guard — Central Integration Hub
// Node.js/Express backend with Socket.io real-time communication
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const socketIo = require('socket.io');

const connectDB = require('./config/db');
const { getGraph } = require('./services/dijkstra');
const RoadNetwork = require('./models/RoadNetwork');
const ThreatEvent = require('./models/ThreatEvent');

// Route imports
const threatRoutes = require('./routes/threatRoutes');
const sightingRoutes = require('./routes/sightingRoutes');
const routingRoutes = require('./routes/routingRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io with CORS for mobile clients
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Make io accessible from routes via req.app.get('io')
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/threats', threatRoutes);
app.use('/api/sightings', sightingRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'Gaja Saviya Path-Guard API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      threats: '/api/threats',
      sightings: '/api/sightings',
      routing: '/api/routing',
      users: '/api/users'
    }
  });
});

// ─── Global Error Handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─── Socket.io Event Handling ────────────────────────────────
// Track active routes for dynamic rerouting
const activeRoutes = new Map(); // socketId -> { userId, startNode, endNode, currentPath }

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Client registers their active navigation route
  socket.on('RegisterRoute', (data) => {
    activeRoutes.set(socket.id, {
      userId: data.userId || socket.id,
      startNode: data.startNode,
      endNode: data.endNode,
      currentPath: data.currentPath || []
    });
    console.log(`[Socket.io] Route registered for ${socket.id}: ${data.startNode} → ${data.endNode}`);
  });

  // Client requests current threat data for their map viewport
  socket.on('RequestThreats', async (data) => {
    try {
      const threats = await ThreatEvent.find({
        status: { $in: ['Verified', 'Pending'] }
      }).sort({ createdAt: -1 }).limit(100);

      socket.emit('ThreatData', threats.map(t => t.toJSON()));
    } catch (err) {
      console.error('[Socket.io] RequestThreats error:', err.message);
      socket.emit('ThreatData', []);
    }
  });

  // Client updates their GPS position
  socket.on('UpdatePosition', (data) => {
    // Could be used for proximity alerts in the future
    socket.data.position = data;
  });

  socket.on('disconnect', () => {
    activeRoutes.delete(socket.id);
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

/**
 * Dynamic Rerouting: When a new threat is created, check if it intersects
 * any active routes and trigger force_reroute for affected users
 */
async function checkAndReroute(newThreat) {
  const graph = getGraph();

  for (const [socketId, route] of activeRoutes) {
    const collision = graph.checkRouteCollision(
      route.currentPath,
      newThreat.location,
      newThreat.radius_meters || 2000
    );

    if (collision) {
      console.log(`[Reroute] Threat collides with route of ${socketId}! Recalculating...`);

      try {
        // Fetch all current threats
        const threats = await ThreatEvent.find({
          status: { $in: ['Verified', 'Pending'] }
        });

        // Recalculate safest path
        const newPath = graph.calculateSafestPath(route.startNode, route.endNode, threats);

        if (newPath.path.length > 0 && JSON.stringify(newPath.path) !== JSON.stringify(route.currentPath)) {
          // Emit force_reroute to the specific client
          io.to(socketId).emit('force_reroute', {
            message: '⚠️ New Threat Detected! Rerouting for your safety...',
            oldPath: route.currentPath,
            newPath: newPath.path,
            newPathCoords: newPath.coordinates,
            threatLocation: newThreat.location.coordinates,
            newTotalCost: newPath.totalCost
          });

          // Update the stored route
          route.currentPath = newPath.path;
          console.log(`[Reroute] force_reroute sent to ${socketId}`);
        }
      } catch (err) {
        console.error(`[Reroute] Error recalculating for ${socketId}:`, err.message);
      }
    }
  }
}

// Hook into threat creation events for dynamic rerouting
// This is called from within the server after threats are saved
app.set('checkAndReroute', checkAndReroute);

// ─── Server Startup ──────────────────────────────────────────
const PORT = process.env.PORT || 5001;

async function startServer() {
  // 1. Init JSON file database (auto-seeds if empty)
  await connectDB();

  // 2. Load road network graph from file DB
  const graph = getGraph();
  try {
    await graph.loadFromDB(RoadNetwork);
    console.log(`[Server] Road network graph loaded successfully`);
  } catch (err) {
    console.warn(`[Server] Could not load road network from DB: ${err.message}`);
    console.warn('[Server] Run "npm run seed" to reset backend/data/db.json');
  }

  // 3. Start HTTP + WebSocket server
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Gaja Saviya Path-Guard — Backend Server             ║');
    console.log(`║  HTTP + WebSocket running on port ${PORT}               ║`);
    console.log('║                                                      ║');
    console.log('║  API Endpoints:                                      ║');
    console.log(`║    GET  http://localhost:${PORT}/                       ║`);
    console.log(`║    POST http://localhost:${PORT}/api/threats             ║`);
    console.log(`║    GET  http://localhost:${PORT}/api/threats/nearby      ║`);
    console.log(`║    POST http://localhost:${PORT}/api/sightings           ║`);
    console.log(`║    POST http://localhost:${PORT}/api/routing/safe-path   ║`);
    console.log(`║    POST http://localhost:${PORT}/api/routing/shortest-path║`);
    console.log(`║    GET  http://localhost:${PORT}/api/routing/network     ║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err.message);
});
