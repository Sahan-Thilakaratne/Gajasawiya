// backend/src/models/User.js
// File-backed user model with reputation scoring
const { createCollection, newId } = require('../config/fileDb');

function reputationScore(doc) {
  if (!doc.total_reports) return 0.5;
  return Math.round((doc.verified_reports / doc.total_reports) * 1000) / 1000;
}

function wrap(raw) {
  const now = new Date().toISOString();
  const doc = {
    phone_number: null,
    primary_district: 'Anuradhapura',
    total_reports: 0,
    verified_reports: 0,
    session_location: { type: 'Point', coordinates: [0, 0] },
    ...raw,
    _id: raw._id || newId(),
    last_active: raw.last_active || now,
    createdAt: raw.createdAt || now,
  };

  Object.defineProperty(doc, 'reputation_score', {
    get() {
      return reputationScore(this);
    },
    enumerable: true,
  });

  doc.toJSON = function toJSON() {
    return {
      ...this,
      reputation_score: reputationScore(this),
      id: this._id,
    };
  };

  doc.save = async function save() {
    return User._saveDoc(this);
  };

  return doc;
}

const base = createCollection('users', { wrap });

function User(data) {
  return wrap(data || {});
}

Object.assign(User, base);

module.exports = User;
