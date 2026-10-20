// backend/src/config/db.js
// Initializes the JSON file database (no MongoDB)
const { readDb, getDbPath } = require('./fileDb');
const { seedDatabase } = require('./seedDatabase');

async function connectDB() {
  const db = readDb();
  console.log(`[DB] Using file database: ${getDbPath()}`);

  if (!db.roads.length) {
    console.log('[DB] Empty road network — seeding demo data…');
    await seedDatabase({ quiet: false });
  } else {
    console.log(
      `[DB] Loaded ${db.roads.length} roads, ${db.users.length} users, ${db.threats.length} threats`,
    );
  }
}

module.exports = connectDB;
