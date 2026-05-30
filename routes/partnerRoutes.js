const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Partner = require('../models/Partner');
const Order   = require('../models/Order');
const OTP     = require('../models/OTP');
const twilioService = require('../services/twilioService');

let io;
const setIO = (socketIO) => { io = socketIO; };

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
  try {
    req.partner = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// POST /api/partner/otp/send
router.post('/otp/send', async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
    const otp = generateOTP();
    const sendResult = await twilioService.sendOTP(cleanPhone, otp);
    await OTP.create({ phone: cleanPhone, otp, channel: sendResult.channel || 'sms' });
    res.json({
      success: true,
      message: 'OTP sent',
      debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// POST /api/partner/otp/verify
router.post('/otp/verify', async (req, res) => {
  try {
    const { phone, otp, name, restaurantName } = req.body;
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

    const otpRecord = await OTP.findOne({ phone: cleanPhone, otp, isVerified: false, expiresAt: { $gt: new Date() } });
    if (!otpRecord) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    otpRecord.isVerified = true;
    await otpRecord.save();

    let partner = await Partner.findOne({ phone: cleanPhone });
    if (!partner) {
      partner = await Partner.create({ phone: cleanPhone, name: name || `Partner${cleanPhone.slice(-4)}`, restaurantName: restaurantName || 'My Restaurant', isPhoneVerified: true, lastLogin: new Date() });
    } else {
      partner.lastLogin = new Date();
      partner.isPhoneVerified = true;
      await partner.save();
    }

    const token = jwt.sign({ partnerId: partner._id, phone: partner.phone, role: 'partner' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      token,
      partner: {
        id:             partner._id,
        name:           partner.name,
        phone:          partner.phone,
        restaurantName: partner.restaurantName,
        isLocationSet:  partner.isLocationSet,
        isNewPartner:   partner.isNewPartner,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

// PATCH /api/partner/location — save shop GPS coordinates
router.patch('/location', authMiddleware, async (req, res) => {
  try {
    const { lat, lng, address } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' });
    }
    await Partner.findByIdAndUpdate(req.partner.partnerId, {
      address:       address || '',
      location:      { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      isLocationSet: true,
      isNewPartner:  false,
    });
    res.json({ success: true, message: 'Shop location saved successfully' });
  } catch (err) {
    console.error('Location save error:', err);
    res.status(500).json({ success: false, message: 'Failed to save location' });
  }
});

// GET /api/partner/my-shop — get shop linked to this partner (matched by phone)
router.get('/my-shop', authMiddleware, async (req, res) => {
  try {
    const Shop    = require('../models/Shop');
    const partner = await Partner.findById(req.partner.partnerId).lean();
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    const shop = await Shop.findOne({ phone: partner.phone }).lean();
    if (!shop) return res.status(404).json({ success: false, message: 'No shop linked to this account. Contact admin.' });
    res.json({ success: true, shop: {
      _id:            shop._id,
      shopId:         shop.shopId,
      shopName:       shop.shopName,
      isOpen:         shop.isOpen,
      isActive:       shop.isActive,
      rating:         shop.rating,
      totalOrders:    shop.totalOrders,
      totalRevenue:   shop.totalRevenue,
      deliveryRadius: shop.deliveryRadius,
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch shop' });
  }
});

// PATCH /api/partner/shop-status — toggle shop online/offline
router.patch('/shop-status', authMiddleware, async (req, res) => {
  try {
    const Shop    = require('../models/Shop');
    const partner = await Partner.findById(req.partner.partnerId).lean();
    const shop    = await Shop.findOne({ phone: partner.phone });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    shop.isOpen = req.body.isOpen ?? !shop.isOpen;
    await shop.save();
    res.json({ success: true, isOpen: shop.isOpen });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// POST /api/partner/orders/:orderId/accept — partner accepts dispatch request
router.post('/orders/:orderId/accept', authMiddleware, async (req, res) => {
  try {
    const Shop       = require('../models/Shop');
    const dispatcher = require('../utils/orderDispatcher');
    const partner    = await Partner.findById(req.partner.partnerId).lean();
    const shop       = await Shop.findOne({ phone: partner.phone }).lean();
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    await dispatcher.shopAccepted(req.params.orderId, shop._id.toString());
    res.json({ success: true, message: 'Order accepted' });
  } catch (err) {
    console.error('[partner accept]', err);
    res.status(500).json({ success: false, message: 'Failed to accept order' });
  }
});

// POST /api/partner/orders/:orderId/reject — partner rejects dispatch request
router.post('/orders/:orderId/reject', authMiddleware, async (req, res) => {
  try {
    const Shop       = require('../models/Shop');
    const dispatcher = require('../utils/orderDispatcher');
    const partner    = await Partner.findById(req.partner.partnerId).lean();
    const shop       = await Shop.findOne({ phone: partner.phone }).lean();
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    await dispatcher.shopRejected(req.params.orderId, shop._id.toString(), req.body.reason || 'Partner rejected');
    res.json({ success: true, message: 'Order rejected' });
  } catch (err) {
    console.error('[partner reject]', err);
    res.status(500).json({ success: false, message: 'Failed to reject order' });
  }
});

// GET /api/partner/earnings — earnings summary for this partner's shop
router.get('/earnings', authMiddleware, async (req, res) => {
  try {
    const Shop  = require('../models/Shop');
    const partner = await Partner.findById(req.partner.partnerId).lean();
    const shop    = await Shop.findOne({ phone: partner.phone }).lean();
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);

    const [todayOrders, weekOrders, allOrders] = await Promise.all([
      Order.find({ shopId: shop._id, createdAt: { $gte: today }, orderStatus: { $ne: 'cancelled' } }).lean(),
      Order.find({ shopId: shop._id, createdAt: { $gte: weekAgo }, orderStatus: { $ne: 'cancelled' } }).lean(),
      Order.find({ shopId: shop._id, orderStatus: 'delivered' }).lean(),
    ]);

    const sum = arr => arr.reduce((s, o) => s + (o.shopEarnings || o.subtotal || 0), 0);

    res.json({
      success: true,
      earnings: {
        todayOrders:   todayOrders.length,
        todayRevenue:  Math.round(sum(todayOrders)),
        weekOrders:    weekOrders.length,
        weekRevenue:   Math.round(sum(weekOrders)),
        totalOrders:   allOrders.length,
        totalRevenue:  Math.round(sum(allOrders)),
        commissionRate: shop.commissionRate || 10,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch earnings' });
  }
});

// GET /api/partner/orders — orders for this partner
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/partner/stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalOrders    = await Order.countDocuments();
    const todayOrders    = await Order.countDocuments({ createdAt: { $gte: today } });
    const pendingOrders  = await Order.countDocuments({ orderStatus: 'pending' });
    const preparingOrders= await Order.countDocuments({ orderStatus: { $in: ['confirmed', 'processing'] } });
    const readyOrders    = await Order.countDocuments({ orderStatus: 'out_for_delivery' });
    const revenue        = await Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]);
    res.json({ success: true, stats: { totalOrders, todayOrders, pendingOrders, preparing: preparingOrders, ready: readyOrders, revenue: revenue[0]?.total || 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// PUT /api/partner/orders/:orderId — update order status (partner side)
router.put('/orders/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderStatus } = req.body;
    const allowed = ['confirmed', 'preparing', 'processing', 'ready', 'out_for_delivery', 'cancelled'];
    if (!allowed.includes(orderStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    // Normalise: dashboard may send 'processing' — map to model enum value 'preparing'
    const normalised = orderStatus === 'processing' ? 'preparing' : orderStatus;

    // Use findOneAndUpdate (not find+save) so Mongoose skips full-document
    // re-validation — old orders may have empty customerName etc.
    const opts = { new: true, runValidators: false };
    let order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { orderStatus: normalised },
      opts
    );
    if (!order) {
      // Fallback: try MongoDB _id
      try {
        order = await Order.findByIdAndUpdate(req.params.orderId, { orderStatus: normalised }, opts);
      } catch (_) {}
    }
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Broadcast to customer tracking screen via socket
    if (io) {
      io.to(`order:${order._id}`).emit('order:status', { orderId: order._id, status: normalised, order });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error('[partner PUT order]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to update order' });
  }
});

module.exports = router;
module.exports.setIO = setIO;
