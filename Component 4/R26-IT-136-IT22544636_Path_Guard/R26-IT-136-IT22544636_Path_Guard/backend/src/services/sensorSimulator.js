// backend/src/services/sensorSimulator.js
// Simulates Component 1 (Fence Breach) and Component 2 (Acoustic Detection) payloads
// Periodically POSTs realistic GeoJSON threat events to the backend API
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';

// Approximate coordinates around Malabe / SLIIT campus (testing area)
const HOTSPOT_ZONES = [
  { name: 'SLIIT North Perimeter',   lat: 6.9160, lng: 79.9740 },
  { name: 'SLIIT South Gate',        lat: 6.9110, lng: 79.9710 },
  { name: 'Pittugala Junction',      lat: 6.9200, lng: 79.9680 },
  { name: 'Malabe Town Center',      lat: 6.9100, lng: 79.9600 },
  { name: 'Kaduwela Bridge Area',    lat: 6.9250, lng: 79.9850 },
  { name: 'Hokandara Road',          lat: 6.8950, lng: 79.9700 },
  { name: 'Millennium City',         lat: 6.9080, lng: 79.9800 },
];

const SENSOR_TYPES = [
  {
    source: 'Sensor_C1_Fence',
    descriptions: [
      'Electric fence wire tension anomaly detected in sector',
      'Fence breach alert: ground vibration sensors triggered',
      'Perimeter fence integrity compromised at checkpoint',
    ],
    threat_level_range: [3, 6],
    penalty: 500,
    behaviors: ['Unknown']
  },
  {
    source: 'Sensor_C2_Acoustic',
    descriptions: [
      'Infrasound rumble pattern detected matching elephant communication',
      'High-frequency trumpet vocalization identified by acoustic array',
      'Aggressive vocalization patterns detected — potential charge behavior',
      'Elephant herd movement sounds detected via microphone array',
    ],
    threat_level_range: [5, 9],
    penalty_range: [1000, 5000],
    behaviors: ['Calm', 'Social', 'Aggressive']
  }
];

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSensorPayload() {
  const sensorType = randomChoice(SENSOR_TYPES);
  const hotspot = randomChoice(HOTSPOT_ZONES);

  // Use precise coordinates (no random offset) to keep threats localized
  const lat = hotspot.lat;
  const lng = hotspot.lng;

  const threatLevel = Math.floor(
    randomInRange(sensorType.threat_level_range[0], sensorType.threat_level_range[1])
  );

  const behavior = randomChoice(sensorType.behaviors);
  const penalty = sensorType.penalty || (behavior === 'Aggressive' ? 5000 : (behavior === 'Social' ? 2000 : 1000));

  return {
    source: sensorType.source,
    threat_level: threatLevel,
    threat_intensity_penalty: penalty,
    latitude: lat.toFixed(6),
    longitude: lng.toFixed(6),
    description: `${randomChoice(sensorType.descriptions)} [${hotspot.name}]`,
    elephant_behavior: behavior,
    radius_meters: 1000
  };
}

async function sendSensorEvent() {
  const payload = generateSensorPayload();

  try {
    const response = await axios.post(`${BACKEND_URL}/api/threats`, payload, {
      timeout: 5000
    });
    console.log(
      `[Simulator] ✅ ${payload.source} event sent | ` +
      `Threat Level: ${payload.threat_level} | ` +
      `Behavior: ${payload.elephant_behavior} | ` +
      `Location: ${payload.latitude}, ${payload.longitude} | ` +
      `ID: ${response.data.data?._id || 'N/A'}`
    );
  } catch (err) {
    console.error(`[Simulator] ❌ Failed to send event: ${err.message}`);
  }
}

// Main simulation loop
async function startSimulation(intervalMs = 30000) {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Gaja Saviya — Sensor Simulator                     ║');
  console.log('║  Simulating C1 (Fence) & C2 (Acoustic) payloads     ║');
  console.log(`║  Interval: ${intervalMs / 1000}s | Target: ${BACKEND_URL}       ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Send an initial event immediately
  await sendSensorEvent();

  // Then send at regular intervals
  setInterval(sendSensorEvent, intervalMs);
}

// Run if called directly: node src/services/sensorSimulator.js
if (require.main === module) {
  const interval = parseInt(process.argv[2]) || 45000;
  startSimulation(interval);
}

module.exports = { generateSensorPayload, sendSensorEvent, startSimulation };
