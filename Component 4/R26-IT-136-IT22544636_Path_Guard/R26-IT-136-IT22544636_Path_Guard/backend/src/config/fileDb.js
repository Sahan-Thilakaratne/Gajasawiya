// backend/src/config/fileDb.js
// Simple JSON file database — no MongoDB / Docker required
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = () => ({
  users: [],
  threats: [],
  sightings: [],
  roads: [],
});

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDb() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const empty = EMPTY_DB();
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      users: parsed.users || [],
      threats: parsed.threats || [],
      sightings: parsed.sightings || [],
      roads: parsed.roads || [],
    };
  } catch (err) {
    console.error('[FileDB] Failed to read db.json, resetting:', err.message);
    const empty = EMPTY_DB();
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
}

function writeDb(db) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') {
      if (!Array.isArray(value) || !value.some((q) => matchQuery(doc, q))) return false;
      continue;
    }

    // Geospatial: { location: { $nearSphere: { $geometry, $maxDistance } } }
    if (value && typeof value === 'object' && value.$nearSphere) {
      const geo = value.$nearSphere.$geometry;
      const maxDist = value.$nearSphere.$maxDistance ?? Infinity;
      const [lng, lat] = geo.coordinates;
      const [docLng, docLat] = doc[key]?.coordinates || [0, 0];
      const dist = haversineMeters(lat, lng, docLat, docLng);
      if (dist > maxDist) return false;
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && value.$in) {
      if (!value.$in.includes(doc[key])) return false;
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && value.$gte) {
      const docVal = doc[key] instanceof Date ? doc[key] : new Date(doc[key]);
      if (docVal < new Date(value.$gte)) return false;
      continue;
    }

    if (doc[key] !== value) return false;
  }
  return true;
}

function makeQuery(collectionName, enrichFn) {
  let filters = {};
  let sortSpec = null;
  let limitN = null;
  let populateSpec = null;

  const api = {
    find(query = {}) {
      filters = query;
      return api;
    },
    sort(spec) {
      sortSpec = spec;
      return api;
    },
    limit(n) {
      limitN = n;
      return api;
    },
    populate(field, select) {
      populateSpec = { field, select };
      return api;
    },
    async exec() {
      const db = readDb();
      let rows = (db[collectionName] || []).filter((d) => matchQuery(d, filters));

      if (sortSpec) {
        const [[field, dir]] = Object.entries(sortSpec);
        rows = [...rows].sort((a, b) => {
          const av = a[field];
          const bv = b[field];
          const an = av instanceof Date || /^\d{4}-/.test(String(av)) ? new Date(av).getTime() : av;
          const bn = bv instanceof Date || /^\d{4}-/.test(String(bv)) ? new Date(bv).getTime() : bv;
          if (an < bn) return dir === -1 || dir === 'desc' ? 1 : -1;
          if (an > bn) return dir === -1 || dir === 'desc' ? -1 : 1;
          return 0;
        });
      }

      if (limitN != null) rows = rows.slice(0, limitN);

      let result = rows.map((d) => enrichFn(d));

      if (populateSpec) {
        const users = readDb().users;
        result = result.map((doc) => {
          const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
          const refId = plain[populateSpec.field];
          const user = users.find((u) => u._id === refId);
          if (user) {
            const enriched = enrichFn(user).toJSON();
            if (populateSpec.select) {
              const fields = populateSpec.select.split(/\s+/).filter(Boolean);
              const picked = { _id: enriched._id };
              for (const f of fields) picked[f] = enriched[f];
              plain[populateSpec.field] = picked;
            } else {
              plain[populateSpec.field] = enriched;
            }
          }
          return plain;
        });
      }

      return result;
    },
    then(resolve, reject) {
      return api.exec().then(resolve, reject);
    },
  };

  return api;
}

function createCollection(collectionName, { wrap }) {
  return {
    find(query = {}) {
      return makeQuery(collectionName, wrap).find(query);
    },

    async findOne(query = {}) {
      const rows = await makeQuery(collectionName, wrap).find(query).limit(1).exec();
      return rows[0] || null;
    },

    async findById(id) {
      if (!id) return null;
      const db = readDb();
      const row = (db[collectionName] || []).find((d) => d._id === String(id));
      return row ? wrap(row) : null;
    },

    async create(data) {
      const db = readDb();
      const now = new Date().toISOString();
      const doc = {
        ...data,
        _id: data._id || newId(),
        createdAt: data.createdAt || now,
      };
      // Normalize nested ObjectId-like refs
      if (doc.reporter && typeof doc.reporter === 'object' && doc.reporter._id) {
        doc.reporter = doc.reporter._id;
      }
      if (doc.reported_by && typeof doc.reported_by === 'object' && doc.reported_by._id) {
        doc.reported_by = doc.reported_by._id;
      }
      db[collectionName].push(doc);
      writeDb(db);
      return wrap(doc);
    },

    async deleteMany(query = {}) {
      const db = readDb();
      const before = db[collectionName].length;
      db[collectionName] = db[collectionName].filter((d) => !matchQuery(d, query));
      const deletedCount = before - db[collectionName].length;
      writeDb(db);
      return { deletedCount };
    },

    async findByIdAndUpdate(id, update, opts = {}) {
      const db = readDb();
      const idx = db[collectionName].findIndex((d) => d._id === String(id));
      if (idx < 0) return null;
      db[collectionName][idx] = { ...db[collectionName][idx], ...update };
      writeDb(db);
      return opts.new === false
        ? wrap({ ...db[collectionName][idx], ...update })
        : wrap(db[collectionName][idx]);
    },

    /** Persist a mutated wrapped document back to disk */
    async _saveDoc(doc) {
      const db = readDb();
      const skip = new Set([
        'toJSON',
        'save',
        'decay_factor',
        'effective_penalty',
        'reputation_score',
        'id',
      ]);
      const plain = {};
      for (const key of Object.keys(doc)) {
        if (skip.has(key)) continue;
        const val = doc[key];
        if (typeof val === 'function') continue;
        plain[key] = val;
      }
      if (!plain._id) plain._id = newId();
      if (!plain.createdAt) plain.createdAt = new Date().toISOString();

      const idx = db[collectionName].findIndex((d) => d._id === plain._id);
      if (idx >= 0) {
        db[collectionName][idx] = plain;
      } else {
        db[collectionName].push(plain);
      }
      writeDb(db);
      return wrap(plain);
    },
  };
}

function getDbPath() {
  return DB_PATH;
}

module.exports = {
  readDb,
  writeDb,
  newId,
  createCollection,
  getDbPath,
  haversineMeters,
  DATA_DIR,
  DB_PATH,
};
