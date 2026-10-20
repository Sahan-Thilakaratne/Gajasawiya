// backend/src/routes/threatRoutes.js
// REST API endpoints for threat event management
const express = require('express');
const router = express.Router();
const ThreatEvent = require('../models/ThreatEvent');

// POST /api/threats — Ingest a new threat event (from C1/C2 sensors)
router.post('/', async (req, res) => {
  try {
    const {
      source,
      threat_level,
      threat_intensity_penalty,
      longitude,
      latitude,
      description,
      elephant_behavior,
      radius_meters,
      confidence_score
    } = req.body;

    const threat = new ThreatEvent({
      source: source || 'Sensor_C1_Fence',
      threat_level: threat_level || 5,
      threat_intensity_penalty: threat_intensity_penalty || 500,
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      },
      description: description || '',
      elephant_behavior: elephant_behavior || 'Unknown',
      radius_meters: radius_meters || 1000,
      confidence_score: confidence_score || 1.0,
      status: 'Verified'
    });

    await threat.save();

    // Replace prior Comp-2 integration threats (avoid stacking on repeated clicks)
    if (threat.source === 'Sensor_C2_Acoustic') {
      const all = await ThreatEvent.find({ source: 'Sensor_C2_Acoustic' });
      for (const t of all) {
        if (t._id !== threat._id) await ThreatEvent.deleteOne({ _id: t._id });
      }
    }

    // Clean up old simulated sensor threats (older than 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    await ThreatEvent.deleteMany({
      source: { $in: ['Sensor_C1_Fence', 'Sensor_C2_Acoustic'] },
      createdAt: { $lt: oneMinuteAgo }
    });

    // Emit via Socket.io (io is attached to req.app)
    const io = req.app.get('io');
    if (io) {
      // Fetch fresh list of all active threats to push to clients (this auto-clears deleted ones from maps)
      const activeThreats = await ThreatEvent.find({ status: { $in: ['Verified', 'Pending'] } });
      io.emit('ThreatData', activeThreats);
      
      // Also trigger checkAndReroute for active navigation clients
      const checkAndReroute = req.app.get('checkAndReroute');
      if (checkAndReroute) checkAndReroute(threat);

      console.log(`[Socket.io] Broadcasted updated threat list (deleted >1m old sensors)`);
    }

    res.status(201).json({
      success: true,
      message: 'Threat event created and broadcasted',
      data: threat.toJSON()
    });
  } catch (err) {
    console.error('[Threats] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/threats/nearby — Geospatial query: threats within radius of a point
// Query params: lat, lng, radius (in meters, default 50000)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 50000 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'lat and lng query parameters are required'
      });
    }

    const threats = await ThreatEvent.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).sort({ createdAt: -1 }).limit(100);

    res.json({
      success: true,
      count: threats.length,
      data: threats.map(t => t.toJSON())
    });
  } catch (err) {
    console.error('[Threats] Nearby query error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/threats — Get all active threats
router.get('/', async (req, res) => {
  try {
    const threats = await ThreatEvent.find({})
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({
      success: true,
      count: threats.length,
      data: threats.map(t => t.toJSON())
    });
  } catch (err) {
    console.error('[Threats] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/threats/:id — Get single threat detail
router.get('/:id', async (req, res) => {
  try {
    const threat = await ThreatEvent.findById(req.params.id);
    if (!threat) {
      return res.status(404).json({ success: false, error: 'Threat not found' });
    }
    res.json({ success: true, data: threat.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/threats/:id/verify — Manual verification by admin
router.patch('/:id/verify', async (req, res) => {
  try {
    const { status } = req.body; // 'Verified' or 'False Alarm'
    const threat = await ThreatEvent.findByIdAndUpdate(
      req.params.id,
      { status: status || 'Verified' },
      { new: true }
    );

    if (!threat) {
      return res.status(404).json({ success: false, error: 'Threat not found' });
    }

    // Broadcast updated status
    const io = req.app.get('io');
    if (io) {
      io.emit('ThreatStatusUpdate', threat.toJSON());
    }

    res.json({ success: true, data: threat.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
