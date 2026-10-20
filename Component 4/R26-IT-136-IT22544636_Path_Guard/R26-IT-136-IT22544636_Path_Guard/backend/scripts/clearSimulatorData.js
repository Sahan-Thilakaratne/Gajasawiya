// scripts/clearSimulatorData.js
const ThreatEvent = require('../src/models/ThreatEvent');

async function clearOldSimulatorData() {
  try {
    const result = await ThreatEvent.deleteMany({
      source: { $in: ['Sensor_C1_Fence', 'Sensor_C2_Acoustic'] },
    });
    console.log(`Deleted ${result.deletedCount} simulated threats from file DB.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

clearOldSimulatorData();
