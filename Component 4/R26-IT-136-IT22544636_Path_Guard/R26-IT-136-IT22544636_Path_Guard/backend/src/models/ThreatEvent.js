// backend/src/models/ThreatEvent.js
// File-backed threat events
const { createCollection, newId } = require('../config/fileDb');

function decayFactor(createdAt) {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);
  return Math.max(0.1, 1.0 - elapsedMinutes / 60);
}

function wrap(raw) {
  const createdAt = raw.createdAt || new Date().toISOString();
  const expiresAt =
    raw.expiresAt ||
    new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  const doc = {
    radius_meters: 1000,
    confidence_score: 0,
    status: 'Pending',
    elephant_behavior: 'Unknown',
    description: '',
    threat_intensity_penalty: 500,
    reported_by: null,
    ...raw,
    _id: raw._id || newId(),
    createdAt,
    expiresAt,
  };

  Object.defineProperty(doc, 'decay_factor', {
    get() {
      return decayFactor(this.createdAt);
    },
    enumerable: true,
  });

  Object.defineProperty(doc, 'effective_penalty', {
    get() {
      return (this.threat_intensity_penalty || 500) * decayFactor(this.createdAt);
    },
    enumerable: true,
  });

  doc.toJSON = function toJSON() {
    return {
      ...this,
      decay_factor: decayFactor(this.createdAt),
      effective_penalty: (this.threat_intensity_penalty || 500) * decayFactor(this.createdAt),
      id: this._id,
    };
  };

  doc.save = async function save() {
    return ThreatEvent._saveDoc(this);
  };

  return doc;
}

const base = createCollection('threats', { wrap });

function ThreatEvent(data) {
  return wrap(data || {});
}

Object.assign(ThreatEvent, base);

module.exports = ThreatEvent;
