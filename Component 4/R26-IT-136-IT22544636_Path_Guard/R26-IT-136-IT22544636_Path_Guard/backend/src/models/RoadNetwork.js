// backend/src/models/RoadNetwork.js
// File-backed road network graph for Dijkstra routing
const { createCollection, newId } = require('../config/fileDb');

function wrap(raw) {
  const doc = {
    name: '',
    edges: [],
    ...raw,
    _id: raw._id || newId(),
  };

  doc.toJSON = function toJSON() {
    return { ...this, id: this._id };
  };

  doc.save = async function save() {
    return RoadNetwork._saveDoc(this);
  };

  return doc;
}

const base = createCollection('roads', { wrap });

function RoadNetwork(data) {
  return wrap(data || {});
}

Object.assign(RoadNetwork, base);

module.exports = RoadNetwork;
