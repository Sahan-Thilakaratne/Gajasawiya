// backend/src/config/seed.js
// Resets backend/data/db.json with demo data
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { seedDatabase } = require('./seedDatabase');
const { getDbPath } = require('./fileDb');

async function seed() {
  try {
    console.log(`[Seed] Writing file database: ${getDbPath()}`);
    await seedDatabase({ quiet: false });
    console.log('[Seed] Done.');
  } catch (err) {
    console.error('[Seed] Error:', err.message);
    process.exitCode = 1;
  }
}

seed();
