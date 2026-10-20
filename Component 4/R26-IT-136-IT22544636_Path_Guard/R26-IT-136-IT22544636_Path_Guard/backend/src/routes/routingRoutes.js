// backend/src/routes/routingRoutes.js
// REST API endpoints for the Dynamic Risk-Aware Routing Engine
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ThreatEvent = require('../models/ThreatEvent');
const RoadNetwork = require('../models/RoadNetwork');
const { seedDatabase } = require('../config/seedDatabase');
const { getGraph } = require('../services/dijkstra');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.join(BACKEND_ROOT, '..', '..', '..', '..');
const EXPORT_SCRIPT = path.join(BACKEND_ROOT, 'scripts', 'exportAnuradhapuraNetwork.py');
const CURRENT_PLAYBACK = path.join(BACKEND_ROOT, 'data', 'current_sim_playback.json');
const MAX_SNAP_M = 3500;

function pythonBin() {
  const win = path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe');
  const unix = path.join(REPO_ROOT, '.venv', 'bin', 'python');
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return 'python';
}

function runExport(playbackFile) {
  return new Promise((resolve, reject) => {
    execFile(
      pythonBin(),
      [EXPORT_SCRIPT, '--playback-file', playbackFile],
      { cwd: REPO_ROOT, timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

// POST /api/routing/sync-network — rebuild road graph for current Comp-2 playback
router.post('/sync-network', async (req, res) => {
  try {
    const { frames } = req.body;
    if (!Array.isArray(frames) || frames.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'frames array (min 2) with x_est/y_est or lat_est/lon_est is required',
      });
    }

    fs.writeFileSync(
      CURRENT_PLAYBACK,
      JSON.stringify({ frames }, null, 2),
      'utf8',
    );

    const exportLog = await runExport(CURRENT_PLAYBACK);
    await seedDatabase({ quiet: true });
    const graph = getGraph();
    await graph.reloadFromDB(RoadNetwork);

    const nodeCount = graph.nodes.size;
    console.log(`[Routing] Network synced: ${nodeCount} nodes — ${exportLog.trim()}`);

    res.json({
      success: true,
      data: {
        node_count: nodeCount,
        message: `Road network synced to current simulation (${nodeCount} nodes)`,
      },
    });
  } catch (err) {
    console.error('[Routing] sync-network error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/routing/safe-path — Calculate the safest route avoiding active threats
router.post('/safe-path', async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng } = req.body;

    if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return res.status(400).json({
        success: false,
        error: 'origin_lat, origin_lng, dest_lat, dest_lng are required',
      });
    }

    const graph = getGraph();
    const oLat = parseFloat(origin_lat);
    const oLng = parseFloat(origin_lng);
    const dLat = parseFloat(dest_lat);
    const dLng = parseFloat(dest_lng);

    const startInfo = graph.findNearestNodeInfo(oLat, oLng);
    const endInfo = graph.findNearestNodeInfo(dLat, dLng);
    const startNode = startInfo.nodeId;
    const endNode = endInfo.nodeId;

    if (!startNode || !endNode) {
      return res.status(404).json({
        success: false,
        error: 'No road network nodes loaded — run sync-network or npm run seed',
      });
    }

    if (startInfo.distanceM > MAX_SNAP_M || endInfo.distanceM > MAX_SNAP_M) {
      return res.status(400).json({
        success: false,
        error:
          `Road network is not near this simulation (snap ${Math.round(startInfo.distanceM)}m / ${Math.round(endInfo.distanceM)}m). ` +
          'Call POST /api/routing/sync-network with current playback frames first.',
        data: {
          origin_snap_m: Math.round(startInfo.distanceM),
          dest_snap_m: Math.round(endInfo.distanceM),
        },
      });
    }

    let threats = [];
    try {
      threats = await ThreatEvent.find({
        status: { $in: ['Verified', 'Pending'] },
      });
    } catch (dbErr) {
      console.warn('[Routing] DB query for threats failed, routing without threat data:', dbErr.message);
    }

    const safePath = graph.calculateSafestPath(startNode, endNode, threats);
    const shortestPath = graph.calculateShortestPath(startNode, endNode);

    let threatsOnShortestPath = 0;
    const threatsOnPathDetails = [];
    if (threats.length > 0 && shortestPath.path.length > 0) {
      for (const threat of threats) {
        if (graph.checkRouteCollision(shortestPath.path, threat.location, threat.radius_meters || 1000)) {
          threatsOnShortestPath++;
          threatsOnPathDetails.push(threat);
        }
      }
    }

    res.json({
      success: true,
      data: {
        safe_route: {
          path_nodes: safePath.path,
          coordinates: safePath.coordinates,
          total_cost: safePath.totalCost,
          type: 'safety_optimized',
        },
        shortest_route: {
          path_nodes: shortestPath.path,
          coordinates: shortestPath.coordinates,
          total_cost: shortestPath.totalCost,
          type: 'distance_optimized',
          threats_on_path: threatsOnShortestPath,
          threats_details: threatsOnPathDetails,
        },
        active_threats_count: threats.length,
        origin_node: startNode,
        destination_node: endNode,
        origin_snap_m: Math.round(startInfo.distanceM),
        dest_snap_m: Math.round(endInfo.distanceM),
      },
    });
  } catch (err) {
    console.error('[Routing] Safe-path error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/routing/shortest-path — Standard distance-optimized path (for comparison)
router.post('/shortest-path', async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng } = req.body;

    if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
      return res.status(400).json({
        success: false,
        error: 'origin_lat, origin_lng, dest_lat, dest_lng are required',
      });
    }

    const graph = getGraph();
    const startNode = graph.findNearestNode(parseFloat(origin_lat), parseFloat(origin_lng));
    const endNode = graph.findNearestNode(parseFloat(dest_lat), parseFloat(dest_lng));

    if (!startNode || !endNode) {
      return res.status(404).json({
        success: false,
        error: 'No road network nodes found near the specified coordinates',
      });
    }

    const result = graph.calculateShortestPath(startNode, endNode);

    res.json({
      success: true,
      data: {
        path_nodes: result.path,
        coordinates: result.coordinates,
        total_cost: result.totalCost,
        type: 'distance_optimized',
      },
    });
  } catch (err) {
    console.error('[Routing] Shortest-path error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/routing/network — Get all road network nodes for map rendering
router.get('/network', (req, res) => {
  try {
    const graph = getGraph();
    const nodes = graph.getNodesForMap();

    res.json({
      success: true,
      count: nodes.length,
      data: nodes,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
