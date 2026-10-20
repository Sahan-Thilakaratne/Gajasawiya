// backend/src/routes/userRoutes.js
// REST API endpoints for user management
const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST /api/users — Create or get a user
router.post('/', async (req, res) => {
  try {
    const { username, phone_number, primary_district } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, error: 'username is required' });
    }

    // Upsert: find existing or create new
    let user = await User.findOne({ username });
    if (!user) {
      user = await User.create({
        username,
        phone_number: phone_number || null,
        primary_district: primary_district || 'Anuradhapura'
      });
    }

    res.json({ success: true, data: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:id — Get user profile with reputation
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users — List all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).sort({ last_active: -1 }).limit(50);
    res.json({ success: true, count: users.length, data: users.map(u => u.toJSON()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
