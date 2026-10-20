// backend/src/routes/sightingRoutes.js
// REST API endpoints for crowdsourced sighting submission and ML verification
const express = require('express');
const router = express.Router();
const axios = require('axios');
const SightingReport = require('../models/SightingReport');
const ThreatEvent = require('../models/ThreatEvent');
const User = require('../models/User');
const { haversineDistance } = require('../services/dijkstra');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

/**
 * Calculate time-of-day weight for ML feature engineering
 * Elephants are more active during dusk (17-20), dawn (5-7), and nighttime
 */
function getTimeOfDayWeight() {
  const hour = new Date().getHours();
  if (hour >= 17 && hour <= 20) return 1.3;  // Dusk - high activity
  if (hour >= 5 && hour <= 7) return 1.2;    // Dawn - high activity
  if (hour >= 21 || hour <= 4) return 1.1;   // Night - moderate activity
  return 0.8;                                 // Daytime - lower activity
}

// POST /api/sightings — Submit a new sighting report for ML verification
router.post('/', async (req, res) => {
  try {
    const {
      reporter_id,
      reported_longitude,
      reported_latitude,
      device_longitude,
      device_latitude,
      elephant_behavior,
      description
    } = req.body;

    // 1. Find or create user
    let user = null;
    if (reporter_id) {
      user = await User.findById(reporter_id);
    }
    if (!user) {
      // Create a demo user if none provided
      user = await User.findOne({}) || await User.create({
        username: 'demo_user_' + Date.now()
      });
    }

    // 2. Feature Engineering for ML Classification

    // F1: GPS Proximity — distance between reported location and device GPS
    const reportedLat = parseFloat(reported_latitude);
    const reportedLng = parseFloat(reported_longitude);
    const deviceLat = parseFloat(device_latitude || reported_latitude);
    const deviceLng = parseFloat(device_longitude || reported_longitude);
    const gpsProximity = haversineDistance(reportedLat, reportedLng, deviceLat, deviceLng);

    // F2: Historical Reputation Score
    const reputationScore = user.reputation_score;

    // F3: Cross-Sensor Correlation — check if C1/C2 registered anomaly within 3km in last 60 min
    let sensorCorrelation = 0;
    try {
      const recentSensorThreats = await ThreatEvent.find({
        source: { $in: ['Sensor_C1_Fence', 'Sensor_C2_Acoustic'] },
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [reportedLng, reportedLat]
            },
            $maxDistance: 3000 // 3km radius
          }
        }
      }).limit(1);
      sensorCorrelation = recentSensorThreats.length > 0 ? 1 : 0;
    } catch (dbErr) {
      console.warn('[Sightings] Sensor correlation query failed (DB may be down):', dbErr.message);
      sensorCorrelation = 0;
    }

    // F4: Temporal Context — time-of-day weight
    const timeWeight = getTimeOfDayWeight();

    // 3. Call ML Microservice for verification
    let mlResult = { probability: 0.5, status: 'Pending' };
    try {
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/verify-sighting`, {
        gps_proximity: gpsProximity,
        user_reputation_score: reputationScore,
        hardware_sensor_sync: sensorCorrelation,
        time_of_day_weight: timeWeight
      }, { timeout: 5000 });
      mlResult = mlResponse.data;
    } catch (mlErr) {
      console.warn('[Sightings] ML service unavailable, using fallback:', mlErr.message);
      // Fallback: simple heuristic if ML service is down
      const fallbackScore = Math.min(0.92, ((reputationScore * 0.4) + (sensorCorrelation * 0.3) +
        ((1000 - Math.min(gpsProximity, 1000)) / 1000 * 0.2) + (timeWeight > 1.0 ? 0.1 : 0)) + 0.6);
      mlResult = {
        probability: Math.round(fallbackScore * 1000) / 1000,
        status: fallbackScore > 0.75 ? 'Verified' : 'Pending'
      };
    }

    // 4. Save sighting report
    const sighting = new SightingReport({
      reporter: user._id,
      reported_location: {
        type: 'Point',
        coordinates: [reportedLng, reportedLat]
      },
      device_gps: {
        type: 'Point',
        coordinates: [deviceLng, deviceLat]
      },
      elephant_behavior: elephant_behavior || 'Calm',
      description: description || '',
      ml_confidence_score: mlResult.probability,
      verification_status: mlResult.status,
      ml_features: {
        gps_proximity: Math.round(gpsProximity),
        user_reputation_score: reputationScore,
        hardware_sensor_sync: sensorCorrelation,
        time_of_day_weight: timeWeight
      }
    });

    await sighting.save();

    // 5. Update user report counts
    user.total_reports += 1;
    if (mlResult.status === 'Verified') {
      user.verified_reports += 1;
    }
    await user.save();

    // 6. If verified (score > 0.75), create a ThreatEvent and broadcast to community
    if (mlResult.status === 'Verified') {
      const behaviorPenalties = { Calm: 500, Social: 1000, Aggressive: 5000 };
      const threat = new ThreatEvent({
        source: 'User_Reported',
        threat_level: elephant_behavior === 'Aggressive' ? 9 : (elephant_behavior === 'Social' ? 6 : 3),
        threat_intensity_penalty: behaviorPenalties[elephant_behavior] || 1000,
        location: {
          type: 'Point',
          coordinates: [reportedLng, reportedLat]
        },
        description: description || `User reported sighting: ${elephant_behavior} elephant`,
        elephant_behavior: elephant_behavior || 'Unknown',
        status: 'Verified',
        confidence_score: mlResult.probability,
        reported_by: user._id
      });

      await threat.save();

      // Broadcast to all connected clients
      const io = req.app.get('io');
      if (io) {
        io.emit('NewVerifiedThreat', threat.toJSON());
        console.log(`[Socket.io] Verified user-reported threat broadcasted: ${threat._id}`);
      }
    }

    res.status(201).json({
      success: true,
      message: mlResult.status === 'Verified'
        ? 'Sighting verified and broadcasted to community!'
        : 'Sighting recorded. Confidence below threshold — visible only to you.',
      data: {
        sighting_id: sighting._id,
        ml_confidence: mlResult.probability,
        verification_status: mlResult.status,
        features_used: sighting.ml_features
      }
    });
  } catch (err) {
    console.error('[Sightings] Submit error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sightings — Get all sighting reports
router.get('/', async (req, res) => {
  try {
    const sightings = await SightingReport.find({})
      .populate('reporter', 'username reputation_score')
      .sort({ submitted_at: -1 })
      .limit(100);

    res.json({ success: true, count: sightings.length, data: sightings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sightings/user/:userId — User's own sighting history
router.get('/user/:userId', async (req, res) => {
  try {
    const sightings = await SightingReport.find({ reporter: req.params.userId })
      .sort({ submitted_at: -1 });

    res.json({ success: true, count: sightings.length, data: sightings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
