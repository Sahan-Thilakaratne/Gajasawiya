// backend/src/services/dijkstra.js
// Dynamic Risk-Aware Routing Engine using Weighted Dijkstra's Algorithm
// Core Innovation: W_total = W_distance + (I_threat × δ(t))

/**
 * MinHeap implementation for the priority queue (replaces external dependency)
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return min;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[idx].cost < this.heap[parent].cost) {
        [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
        idx = parent;
      } else break;
    }
  }

  _sinkDown(idx) {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < length && this.heap[left].cost < this.heap[smallest].cost) smallest = left;
      if (right < length && this.heap[right].cost < this.heap[smallest].cost) smallest = right;
      if (smallest !== idx) {
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      } else break;
    }
  }
}

/**
 * Haversine formula: calculates the great-circle distance between two GPS points
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Temporal Decay Function δ(t)
 * Returns a decay multiplier between 0.1 (old threat) and 1.0 (fresh threat)
 * @param {Date} createdAt - When the threat was detected
 * @param {number} halfLifeMinutes - Time in minutes for decay to reach 0.5 (default 30)
 * @returns {number} Decay factor
 */
function temporalDecay(createdAt, halfLifeMinutes = 30) {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);
  // Linear decay: δ(t) = max(0.1, 1.0 - (elapsed / 60))
  return Math.max(0.1, 1.0 - (elapsedMinutes / (halfLifeMinutes * 2)));
}

/**
 * Threat intensity penalties based on source and behavior
 */
const THREAT_PENALTIES = {
  'Sensor_C1_Fence': 500,       // Fence breach
  'Sensor_C2_Acoustic': 2000,   // Acoustic detection
  'User_Reported': 1000,        // User reported warning
  // Behavior multipliers
  'Calm': 0.5,
  'Social': 1.0,
  'Aggressive': 2.5,
  'Unknown': 1.0
};

/**
 * The core routing graph with dynamic risk-aware weights
 */
class SafeRoutingGraph {
  constructor() {
    this.nodes = new Map(); // node_id -> { lat, lng, name }
    this.edges = new Map(); // node_id -> Map(neighbor_id -> { distance, dynamicCost, roadName })
  }

  addNode(id, lat, lng, name = '') {
    this.nodes.set(id, { lat, lng, name });
    if (!this.edges.has(id)) {
      this.edges.set(id, new Map());
    }
  }

  addEdge(source, destination, distance, roadName = 'Unnamed Road') {
    if (!this.edges.has(source)) this.edges.set(source, new Map());
    if (!this.edges.has(destination)) this.edges.set(destination, new Map());

    this.edges.get(source).set(destination, {
      distance,
      dynamicCost: distance,
      roadName
    });
    this.edges.get(destination).set(source, {
      distance,
      dynamicCost: distance,
      roadName
    });
  }

  /**
   * Reset all edge costs to base distance (remove threat penalties)
   */
  resetCosts() {
    for (const [, neighbors] of this.edges) {
      for (const [, edgeData] of neighbors) {
        edgeData.dynamicCost = edgeData.distance;
      }
    }
  }

  /**
   * Apply threat penalties to edges within the threat's influence radius
   * Cost Function: W_total = W_distance + (I_threat × δ(t))
   *
   * @param {Array} threats - Array of threat objects with { location, threat_intensity_penalty, createdAt, elephant_behavior, radius_meters }
   */
  applyThreatPenalties(threats) {
    this.resetCosts();

    for (const threat of threats) {
      const threatLat = threat.location.coordinates[1];
      const threatLng = threat.location.coordinates[0];
      const intensity = threat.threat_intensity_penalty || THREAT_PENALTIES[threat.source] || 500;
      const behaviorMultiplier = THREAT_PENALTIES[threat.elephant_behavior] || 1.0;
      const decay = temporalDecay(threat.createdAt);
      const radius = threat.radius_meters || 2000;

      // Calculate I_threat × δ(t) with behavior multiplier
      const penalty = intensity * behaviorMultiplier * decay;

      // Apply penalty to all edges whose midpoint falls within the threat radius
      for (const [nodeId, neighbors] of this.edges) {
        const nodeData = this.nodes.get(nodeId);
        if (!nodeData) continue;

        for (const [neighborId, edgeData] of neighbors) {
          const neighborData = this.nodes.get(neighborId);
          if (!neighborData) continue;

          // Calculate midpoint of the edge
          const midLat = (nodeData.lat + neighborData.lat) / 2;
          const midLng = (nodeData.lng + neighborData.lng) / 2;

          // Haversine distance from edge midpoint to threat location
          const distToThreat = haversineDistance(midLat, midLng, threatLat, threatLng);

          if (distToThreat <= radius) {
            // W_total = W_distance + (I_threat × δ(t))
            // The closer the edge to the threat, the higher the penalty
            const proximityFactor = 1 - (distToThreat / radius); // 1.0 at center, 0.0 at edge
            edgeData.dynamicCost += penalty * proximityFactor;
          }
        }
      }
    }
  }

  /**
   * Weighted Dijkstra's Algorithm — finds the path with minimum total cost
   * When threats are applied, this becomes a "safety-optimized" path
   * When costs are reset, this becomes a standard "distance-optimized" path
   *
   * @param {string} startNode - Starting node ID
   * @param {string} endNode - Destination node ID
   * @returns {{ path: string[], totalCost: number, coordinates: Array<{latitude, longitude}> }}
   */
  calculatePath(startNode, endNode) {
    if (!this.nodes.has(startNode) || !this.nodes.has(endNode)) {
      return { path: [], totalCost: Infinity, coordinates: [] };
    }

    const distances = new Map();
    const previous = new Map();
    const pq = new MinHeap();

    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
    }

    distances.set(startNode, 0);
    pq.push({ node: startNode, cost: 0 });

    while (!pq.isEmpty()) {
      const current = pq.pop();

      if (current.node === endNode) break;
      if (current.cost > distances.get(current.node)) continue;

      const neighbors = this.edges.get(current.node);
      if (!neighbors) continue;

      for (const [neighborId, edgeData] of neighbors) {
        const newCost = distances.get(current.node) + edgeData.dynamicCost;

        if (newCost < distances.get(neighborId)) {
          distances.set(neighborId, newCost);
          previous.set(neighborId, current.node);
          pq.push({ node: neighborId, cost: newCost });
        }
      }
    }

    // Reconstruct path
    const path = [];
    let curr = endNode;
    while (curr !== null) {
      path.unshift(curr);
      curr = previous.get(curr);
    }

    if (path[0] !== startNode) {
      return { path: [], totalCost: Infinity, coordinates: [] };
    }

    // Build coordinate array for map rendering
    const coordinates = path.map(nodeId => {
      const node = this.nodes.get(nodeId);
      return { latitude: node.lat, longitude: node.lng };
    });

    return {
      path,
      totalCost: Math.round(distances.get(endNode)),
      coordinates
    };
  }

  /**
   * Calculate the shortest path (distance-only, no threat penalties)
   */
  calculateShortestPath(startNode, endNode) {
    this.resetCosts();
    return this.calculatePath(startNode, endNode);
  }

  /**
   * Calculate the safest path (with threat penalties applied)
   */
  calculateSafestPath(startNode, endNode, threats) {
    this.applyThreatPenalties(threats);
    return this.calculatePath(startNode, endNode);
  }

  /**
   * Check if a threat intersects with an active route
   * Used for dynamic rerouting via WebSocket
   *
   * @param {Array<string>} routePath - Array of node IDs in the current route
   * @param {Object} threatLocation - { coordinates: [lng, lat] }
   * @param {number} radiusMeters - Threat influence radius
   * @returns {boolean} True if the threat intersects the route
   */
  checkRouteCollision(routePath, threatLocation, radiusMeters = 2000) {
    const threatLat = threatLocation.coordinates[1];
    const threatLng = threatLocation.coordinates[0];

    for (const nodeId of routePath) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const dist = haversineDistance(node.lat, node.lng, threatLat, threatLng);
      if (dist <= radiusMeters) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the nearest node to a given GPS coordinate
   */
  findNearestNode(lat, lng) {
    return this.findNearestNodeInfo(lat, lng).nodeId;
  }

  findNearestNodeInfo(lat, lng) {
    let nearestId = null;
    let nearestDist = Infinity;

    for (const [nodeId, nodeData] of this.nodes) {
      const dist = haversineDistance(lat, lng, nodeData.lat, nodeData.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = nodeId;
      }
    }

    return { nodeId: nearestId, distanceM: nearestDist };
  }

  async reloadFromDB(RoadNetworkModel) {
    this.nodes.clear();
    this.edges.clear();
    await this.loadFromDB(RoadNetworkModel);
  }

  /**
   * Load graph from RoadNetwork documents (file DB)
   */
  async loadFromDB(RoadNetworkModel) {
    const nodes = await RoadNetworkModel.find({});
    
    for (const doc of nodes) {
      const [lng, lat] = doc.coordinates.coordinates;
      this.addNode(doc.node_id, lat, lng, doc.name);
    }

    for (const doc of nodes) {
      for (const edge of doc.edges) {
        const targetNode = this.nodes.get(edge.target_node);
        if (targetNode) {
          const sourceNode = this.nodes.get(doc.node_id);
          const distance = edge.distance || haversineDistance(
            sourceNode.lat, sourceNode.lng,
            targetNode.lat, targetNode.lng
          );
          // Only add if not already added (avoid duplicates in undirected graph)
          if (!this.edges.get(doc.node_id)?.has(edge.target_node)) {
            this.addEdge(doc.node_id, edge.target_node, distance, edge.road_name);
          }
        }
      }
    }

    console.log(`[Dijkstra] Graph loaded: ${this.nodes.size} nodes, ${this._countEdges()} edges`);
  }

  _countEdges() {
    let count = 0;
    for (const [, neighbors] of this.edges) {
      count += neighbors.size;
    }
    return count / 2; // undirected
  }

  /**
   * Get all node data for frontend map rendering
   */
  getNodesForMap() {
    const result = [];
    for (const [id, data] of this.nodes) {
      result.push({ id, ...data });
    }
    return result;
  }
}

// Singleton graph instance
let graphInstance = null;

function getGraph() {
  if (!graphInstance) {
    graphInstance = new SafeRoutingGraph();
  }
  return graphInstance;
}

module.exports = {
  SafeRoutingGraph,
  getGraph,
  haversineDistance,
  temporalDecay,
  THREAT_PENALTIES
};
