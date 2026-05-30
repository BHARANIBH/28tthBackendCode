const router = require('express').Router();
const jwt = require('jsonwebtoken');
const OTP = require('../models/OTP');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');
const DeliveryAgent = require('../models/DeliveryAgent');
const twilioService = require('../services/twilioService');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/send-otp
// body: { phone, role: 'customer' | 'shop' | 'delivery' }
router.post('/send-otp', async (req, res) => {
  try {
    const { phone, role = 'customer' } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTP.findOneAndUpdate(
      { phone },
      { $set: { phone, otp, expiresAt, attempts: 0, isVerified: false } },
      { upsert: true, new: true }
    );

    let smsSent = false;
    try {
      const result = await twilioService.sendOTP(phone, otp);
      smsSent = result.success;
    } catch (smsErr) {
      console.error('SMS failed:', smsErr.message);
    }
    console.log(`OTP for ${phone} [${role}]: ${otp}`);

    res.json({
      success: true,
      message: smsSent ? 'OTP sent via SMS' : 'OTP generated (SMS unavailable)',
      debug_otp: otp,   // always return so app can auto-fill during testing
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/verify-otp
// body: { phone, otp, role, name (optional for new users) }
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, role = 'customer', name, shopName, fcmToken } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

    const record = await OTP.findOne({ phone, role });
    if (!record) return res.status(400).json({ error: 'OTP not found. Request a new one.' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired' });
    if (record.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    await OTP.deleteOne({ phone, role });

    let user, isNew = false;

    if (role === 'customer') {
      user = await Customer.findOne({ phone });
      if (!user) {
        user = await Customer.create({ phone, name: name || '', isPhoneVerified: true, fcmToken: fcmToken || '' });
        isNew = true;
      } else {
        if (fcmToken) user.fcmToken = fcmToken;
        user.isPhoneVerified = true;
        await user.save();
      }
    } else if (role === 'shop') {
      user = await Shop.findOne({ phone });
      if (!user) {
        user = await Shop.create({
          phone,
          ownerName: name || '',
          shopName: shopName || 'My Chicken Shop',
          address: '',
          isPhoneVerified: true,
          fcmToken: fcmToken || '',
        });
        isNew = true;
      } else {
        if (fcmToken) user.fcmToken = fcmToken;
        user.isPhoneVerified = true;
        await user.save();
      }
    } else if (role === 'delivery') {
      user = await DeliveryAgent.findOne({ phone });
      if (!user) {
        user = await DeliveryAgent.create({ phone, name: name || '', isPhoneVerified: true, fcmToken: fcmToken || '' });
        isNew = true;
      } else {
        if (fcmToken) user.fcmToken = fcmToken;
        user.isPhoneVerified = true;
        await user.save();
      }
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const token = generateToken({ id: user._id, phone, role });

    res.json({ success: true, token, user, isNew, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
