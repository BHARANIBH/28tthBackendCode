const express  = require('express');
const router   = express.Router();
const Address  = require('../models/Address');
const jwt      = require('jsonwebtoken');

// ── Auth middleware ──────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'gonaatu_secret');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// GET all addresses for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const addresses = await Address.find({ userId: String(userId) })
      .sort({ createdAt: -1 });
    res.json({ success: true, addresses });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch addresses' });
  }
});

// POST new address
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { label, flatNo, landmark, address, lat, lng } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, message: 'Address is required' });
    }

    const newAddress = new Address({
      userId:  String(userId),
      name:    req.user.name  || 'User',
      phone:   req.user.phone || '',
      houseNo: flatNo   || '',
      pincode: '',
      address,
      saveAs:  label    || 'Home',
      landmark: landmark || '',
      lat,
      lng,
    });

    await newAddress.save();
    res.status(201).json({ success: true, address: newAddress });
  } catch (e) {
    console.error('Error saving address:', e);
    res.status(500).json({ success: false, message: 'Failed to add address' });
  }
});

// DELETE one address
router.delete('/:id', auth, async (req, res) => {
  try {
    await Address.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Address deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete address' });
  }
});

// DELETE ALL addresses for logged-in user
router.delete('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    await Address.deleteMany({ userId: String(userId) });
    res.json({ success: true, message: 'All addresses deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete all addresses' });
  }
});

module.exports = router;
