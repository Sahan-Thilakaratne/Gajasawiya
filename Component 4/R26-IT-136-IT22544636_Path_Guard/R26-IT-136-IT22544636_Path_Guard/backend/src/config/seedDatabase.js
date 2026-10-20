// backend/src/config/seedDatabase.js
const { writeDb, newId } = require('./fileDb');
const {
  ROAD_NODES,
  ROAD_EDGES,
  DEMO_USERS,
  DEMO_THREATS,
} = require('./seedData');
const fs = require('fs');
const path = require('path');

const ANURADHAPURA_NETWORK = path.join(__dirname, '../../data/anuradhapura_network.json');

function loadAnuradhapuraRoads() {
  if (!fs.existsSync(ANURADHAPURA_NETWORK)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(ANURADHAPURA_NETWORK, 'utf8'));
    if (!raw?.roads?.length) return null;
    return raw.roads.map((r) => ({
      _id: newId(),
      node_id: r.node_id,
      name: r.name || r.node_id,
      coordinates: r.coordinates,
      edges: r.edges || [],
    }));
  } catch (err) {
    console.warn('[Seed] Could not read anuradhapura_network.json:', err.message);
    return null;
  }
}

async function seedDatabase({ quiet = false } = {}) {
  const anuradhapura = loadAnuradhapuraRoads();
  let roads;

  if (anuradhapura) {
    roads = anuradhapura;
    if (!quiet) {
      console.log(`[Seed] Using Anuradhapura network (${roads.length} nodes from Comp-3 export)`);
    }
  } else {
    const edgeMap = {};
    for (const edge of ROAD_EDGES) {
      if (!edgeMap[edge.from]) edgeMap[edge.from] = [];
      if (!edgeMap[edge.to]) edgeMap[edge.to] = [];
      edgeMap[edge.from].push({
        target_node: edge.to,
        distance: edge.distance,
        road_name: edge.road,
      });
      edgeMap[edge.to].push({
        target_node: edge.from,
        distance: edge.distance,
        road_name: edge.road,
      });
    }

    const now = new Date().toISOString();
    roads = ROAD_NODES.map((node) => ({
      _id: newId(),
      node_id: node.node_id,
      name: node.name,
      coordinates: { type: 'Point', coordinates: node.coordinates },
      edges: edgeMap[node.node_id] || [],
      createdAt: now,
    }));
    if (!quiet) {
      console.log('[Seed] Using built-in Malabe demo network (run exportAnuradhapuraNetwork.py for Anuradhapura)');
    }
  }

  const now = new Date().toISOString();

  const users = DEMO_USERS.map((u) => ({
    _id: newId(),
    ...u,
    session_location: { type: 'Point', coordinates: [0, 0] },
    last_active: now,
    createdAt: now,
  }));

  const threats = DEMO_THREATS.map((t) => ({
    _id: newId(),
    ...t,
    reported_by: null,
    createdAt: now,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  }));

  // No static demo threat in Anuradhapura flow — elephant threat comes from Comp-2 via API
  const seedThreats = anuradhapura ? [] : threats;

  writeDb({
    users,
    threats: seedThreats,
    sightings: [],
    roads,
  });

  if (!quiet) {
    console.log(`[Seed] Wrote ${roads.length} roads, ${users.length} users, ${seedThreats.length} threats`);
    console.log(
      anuradhapura
        ? '[Seed] File database ready (Anuradhapura / Comp-2 sim area)'
        : '[Seed] File database ready (Malabe demo network)',
    );
  }

  return { roads: roads.length, users: users.length, threats: seedThreats.length };
}

module.exports = { seedDatabase };
