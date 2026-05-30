const router = require('express').Router();
const auth = require('../middleware/auth');
const DeliveryAgent = require('../models/DeliveryAgent');
const Order = require('../models/Order');

let io;
const setIO = (socketIO) => { io = socketIO; };

// GET /api/delivery/profile
router.get('/profile', auth(['delivery']), async (req, res) => {
  try {
    const agent = await DeliveryAgent.findById(req.user.id).select('-fcmToken');
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/delivery/profile
router.put('/profile', auth(['delivery']), async (req, res) => {
  try {
    const allowed = ['name', 'vehicleType', 'vehicleNumber', 'bankDetails'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const agent = await DeliveryAgent.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/delivery/online
router.put('/online', auth(['delivery']), async (req, res) => {
  try {
    const { isOnline } = req.body;
    const agent = await DeliveryAgent.findByIdAndUpdate(
      req.user.id,
      { isOnline, isAvailable: isOnline },
      { new: true }
    );
    res.json({ success: true, isOnline: agent.isOnline });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/delivery/location
router.put('/location', auth(['delivery']), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await DeliveryAgent.findByIdAndUpdate(req.user.id, {
      location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    });

    const agent = await DeliveryAgent.findById(req.user.id);
    if (agent.currentOrderId && io) {
      io.to(`order:${agent.currentOrderId}`).emit('delivery:location', { lat, lng });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/delivery/current-order
router.get('/current-order', auth(['delivery']), async (req, res) => {
  try {
    const agent = await DeliveryAgent.findById(req.user.id);
    if (!agent.currentOrderId) return res.json({ success: true, order: null });

    const order = await Order.findById(agent.currentOrderId)
      .populate('shopId', 'shopName address location phone')
      .populate('customerId', 'name phone');
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/delivery/orders
router.get('/orders', auth(['delivery']), async (req, res) => {
  try {
    const orders = await Order.find({ deliveryAgentId: req.user.id })
      .populate('shopId', 'shopName')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/delivery/orders/:orderId/picked-up
router.put('/orders/:orderId/picked-up', auth(['delivery']), async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { orderStatus: 'picked_up' },
      { new: true }
    );
    if (io) io.to(`order:${order._id}`).emit('order:status', { orderId: order._id, status: 'picked_up', order });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/delivery/stats
router.get('/stats', auth(['delivery']), async (req, res) => {
  try {
    const agent = await DeliveryAgent.findById(req.user.id);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const todayDeliveries = await Order.countDocuments({
      deliveryAgentId: req.user.id,
      orderStatus: 'delivered',
      deliveredAt: { $gte: today },
    });

    res.json({
      success: true,
      stats: {
        totalDeliveries: agent.totalDeliveries,
        totalEarnings: agent.totalEarnings,
        todayDeliveries,
        rating: agent.rating,
        isOnline: agent.isOnline,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
module.exports.setIO = setIO;
