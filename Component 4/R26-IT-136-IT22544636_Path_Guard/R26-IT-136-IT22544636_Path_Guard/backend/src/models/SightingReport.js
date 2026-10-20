// backend/src/models/SightingReport.js
// File-backed crowdsourced sighting submissions
const { createCollection, newId } = require('../config/fileDb');

function wrap(raw) {
  const doc = {
    elephant_behavior: 'Calm',
    description: '',
    ml_confidence_score: 0,
    verification_status: 'Processing',
    ml_features: {
      gps_proximity: 0,
      user_reputation_score: 0.5,
      hardware_sensor_sync: 0,
      time_of_day_weight: 1.0,
    },
    ...raw,
    _id: raw._id || newId(),
    submitted_at: raw.submitted_at || new Date().toISOString(),
  };

  if (doc.reporter && typeof doc.reporter === 'object' && doc.reporter._id) {
    doc.reporter = doc.reporter._id;
  }

  doc.toJSON = function toJSON() {
    return { ...this, id: this._id };
  };

  doc.save = async function save() {
    return SightingReport._saveDoc(this);
  };

  return doc;
}

const base = createCollection('sightings', { wrap });

function SightingReport(data) {
  return wrap(data || {});
}

Object.assign(SightingReport, base);

module.exports = SightingReport;
