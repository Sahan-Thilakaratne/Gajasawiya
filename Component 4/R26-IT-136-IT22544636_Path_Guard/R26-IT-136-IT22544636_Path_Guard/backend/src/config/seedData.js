// backend/src/config/seedData.js
// Demo road network / users / threats for the file database

const ROAD_NODES = [
  { node_id: 'N01', name: 'SLIIT Main Gate', coordinates: [79.9726, 6.9147] },
  { node_id: 'N01B', name: 'New Kandy Rd Curve 1', coordinates: [79.9705, 6.917] },
  { node_id: 'N02', name: 'Pittugala Junction', coordinates: [79.968, 6.92] },
  { node_id: 'N03', name: 'Malabe Town Center', coordinates: [79.96, 6.91] },
  { node_id: 'N03B', name: 'Malabe Bypass Curve', coordinates: [79.965, 6.905] },
  { node_id: 'N04', name: 'Kaduwela Junction', coordinates: [79.983, 6.931] },
  { node_id: 'N05', name: 'Athurugiriya Junction', coordinates: [79.995, 6.9] },
  { node_id: 'N06', name: 'Battaramulla Junction', coordinates: [79.93, 6.9] },
  { node_id: 'N09', name: 'Thalangama Junction', coordinates: [79.94, 6.915] },
  { node_id: 'N10', name: 'Hokandara Junction', coordinates: [79.97, 6.895] },
  { node_id: 'N14', name: 'Kaduwela Bridge', coordinates: [79.985, 6.925] },
  { node_id: 'N19', name: 'SLIIT Back Gate', coordinates: [79.975, 6.912] },
  { node_id: 'N20', name: 'Millennium City', coordinates: [79.98, 6.908] },
  { node_id: 'N21', name: 'Chandrika Kumaratunga Mawatha', coordinates: [79.973, 6.905] },
  { node_id: 'N22', name: 'Malabe Arangala Road', coordinates: [79.985, 6.9] },
];

const ROAD_EDGES = [
  { from: 'N01', to: 'N01B', distance: 400, road: 'New Kandy Road' },
  { from: 'N01B', to: 'N02', distance: 500, road: 'New Kandy Road' },
  { from: 'N02', to: 'N04', distance: 2000, road: 'Kaduwela Road' },
  { from: 'N01', to: 'N03B', distance: 1200, road: 'Malabe Link Road' },
  { from: 'N03B', to: 'N03', distance: 600, road: 'Town Center Link' },
  { from: 'N01', to: 'N03', distance: 1500, road: 'Direct Malabe Road' },
  { from: 'N19', to: 'N21', distance: 800, road: 'Campus Back Road' },
  { from: 'N21', to: 'N22', distance: 1500, road: 'Arangala Parallel' },
  { from: 'N22', to: 'N05', distance: 1200, road: 'Athurugiriya Road' },
  { from: 'N21', to: 'N10', distance: 1100, road: 'Hokandara Road' },
  { from: 'N19', to: 'N14', distance: 2500, road: 'Kaduwela Bypass North' },
  { from: 'N01', to: 'N19', distance: 400, road: 'SLIIT Internal Road' },
  { from: 'N19', to: 'N20', distance: 700, road: 'Millennium Link' },
  { from: 'N20', to: 'N05', distance: 2000, road: 'Athurugiriya Link' },
  { from: 'N04', to: 'N14', distance: 900, road: 'Kaduwela Bridge Road' },
  { from: 'N03', to: 'N09', distance: 2200, road: 'Thalangama Road' },
];

const DEMO_USERS = [
  {
    username: 'ranger_silva',
    phone_number: '+94771234567',
    primary_district: 'Malabe',
    total_reports: 45,
    verified_reports: 42,
  },
  {
    username: 'farmer_perera',
    phone_number: '+94772345678',
    primary_district: 'Kaduwela',
    total_reports: 12,
    verified_reports: 8,
  },
  {
    username: 'tourist_john',
    phone_number: '+94773456789',
    primary_district: 'Battaramulla',
    total_reports: 3,
    verified_reports: 1,
  },
];

const DEMO_THREATS = [
  {
    source: 'Sensor_C1_Fence',
    threat_level: 9,
    threat_intensity_penalty: 10000,
    location: { type: 'Point', coordinates: [79.968, 6.92] },
    description: 'MAJOR BREACH: Elephant herd crossing Pittugala Junction',
    elephant_behavior: 'Aggressive',
    status: 'Verified',
    confidence_score: 1.0,
    radius_meters: 1000,
  },
];

module.exports = {
  ROAD_NODES,
  ROAD_EDGES,
  DEMO_USERS,
  DEMO_THREATS,
};
