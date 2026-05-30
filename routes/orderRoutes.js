const router       = require('express').Router();
const auth         = require('../middleware/auth');
const Order        = require('../models/Order');
const Shop         = require('../models/Shop');
const Customer     = require('../models/Customer');
const User         = require('../models/User');
const DeliveryAgent= require('../models/DeliveryAgent');
const Transaction  = require('../models/Transaction');
const dispatcher   = require('../utils/orderDispatcher');
const { validateCoupon } = require('../utils/coupons');
const { calculateDeliveryFee } = require('../utils/shopMatcher');

let io;
const setIO = (socketIO) => {
  io = socketIO;
  dispatcher.setIO(socketIO);
};

// ── POST /api/orders  — place order ─────────────────────────────
router.post('/', auth(['customer']), async (req, res) => {
  try {
    const {
      items, deliveryAddress, paymentMethod,
      couponCode, notes, deliverySlot,
    } = req.body;

    // ── Validate cart ──────────────────────────────────────────
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const subtotal = items.reduce((sum, i) => sum + (i.total || i.price * i.quantity), 0);

    // ── Customer location from delivery address ────────────────
    const customerLat = deliveryAddress?.location?.coordinates?.[1] || 0;
    const customerLon = deliveryAddress?.location?.coordinates?.[0] || 0;

    // ── Distance-based delivery fee ───────────────────────────
    const deliveryCharge = calculateDeliveryFee(3, subtotal); // default 3 km until shop is known
    const packagingFee   = 10;
    const tax            = 0;   // Fresh chicken: 0% GST in India

    // ── Coupon validation ─────────────────────────────────────
    let couponDiscount = 0;
    let couponMsg      = '';
    if (couponCode) {
      const cv = validateCoupon(couponCode, subtotal);
      if (!cv.valid) return res.status(400).json({ error: cv.message });
      couponDiscount = cv.discount;
      couponMsg      = cv.message;
    }

    const totalPrice = subtotal + deliveryCharge + packagingFee + tax - couponDiscount;

    // Customers authenticate via /api/otp → stored in User model, not Customer model.
    // The JWT already carries name & phone, so no extra DB round-trip needed.
    const deliveryOtp   = Math.floor(1000 + Math.random() * 9000).toString();
    const customerName  = req.user.name  || `User${(req.user.phone || '').slice(-4)}`;
    const customerPhone = req.user.phone || '';

    // ── Sanitize items — strip non-ObjectId productIds (e.g. numeric fallback IDs) ─
    const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id ?? ''));
    const sanitizedItems = items.map(item => ({
      ...item,
      productId: isValidObjectId(item.productId) ? item.productId : undefined,
    }));

    // ── Create order (shopId = null — dispatcher will fill it) ─
    const order = await Order.create({
      customerId:   req.user.id,
      shopId:       undefined,          // will be set by dispatcher
      customerName,
      customerPhone,
      items: sanitizedItems,
      deliveryAddress,
      subtotal,
      deliveryCharge,
      packagingFee,
      tax,
      couponCode:      couponCode || '',
      couponDiscount,
      discount:        couponDiscount,
      totalPrice,
      paymentMethod,
      notes:       notes || '',
      deliverySlot:deliverySlot || '',
      deliveryOtp,
      dispatchStatus: 'searching',
      estimatedDeliveryTime: new Date(Date.now() + 35 * 60_000),
    });

    // Increment order count in User model (customers use User collection via /api/otp)
    await User.findByIdAndUpdate(req.user.id, { $inc: { orderCount: 1 } });

    // ── Start dispatcher in background ────────────────────────
    // (non-blocking — customer gets response immediately)
    dispatcher.startDispatch(order, customerLat, customerLon);

    return res.status(201).json({
      success:    true,
      order,
      couponMsg,
      message: 'Order placed! Finding the nearest shop…',
    });
  } catch (err) {
    console.error('[POST /orders]', err);
    res.status(500).json({ message: err.message || 'Failed to place order' });
  }
});

// ── POST /api/orders/coupon/validate ─────────────────────────────
// Customer app calls this to show discount before checkout
router.post('/coupon/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    const result = validateCoupon(code, subtotal);
    return res.json(result);
  } catch (err) {
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});

// ── POST /api/orders/:orderId/accept  — shop accepts ─────────────
router.post('/:orderId/accept', auth(['shop']), async (req, res) => {
  try {
    const { orderId }  = req.params;
    const shopId       = req.user.id; // shop's own ID from JWT
    await dispatcher.shopAccepted(orderId, shopId);
    res.json({ success: true, message: 'Order accepted' });
  } catch (err) {
    console.error('[accept]', err);
    res.status(500).json({ error: 'Failed to accept order' });
  }
});

// ── POST /api/orders/:orderId/reject  — shop rejects ─────────────
router.post('/:orderId/reject', auth(['shop']), async (req, res) => {
  try {
    const { orderId }  = req.params;
    const { reason }   = req.body;
    const shopId       = req.user.id;
    await dispatcher.shopRejected(orderId, shopId, reason || 'Shop rejected');
    res.json({ success: true, message: 'Rejected — trying next shop' });
  } catch (err) {
    console.error('[reject]', err);
    res.status(500).json({ error: 'Failed to reject order' });
  }
});

// ── POST /api/orders/:orderId/rider-accept  — rider accepts ──────
router.post('/:orderId/rider-accept', auth(['delivery']), async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId     = req.user.id;
    await dispatcher.riderAccepted(orderId, riderId);
    res.json({ success: true, message: 'Delivery assignment accepted' });
  } catch (err) {
    console.error('[rider-accept]', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/orders/:orderId/rider-reject  — rider rejects ──────
router.post('/:orderId/rider-reject', auth(['delivery']), async (req, res) => {
  try {
    const { orderId } = req.params;
    const riderId     = req.user.id;
    await dispatcher.riderRejected(orderId, riderId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── GET /api/orders/my ───────────────────────────────────────────
router.get('/my/:phone?', async (req, res) => {
  try {
    const filter = req.params.phone
      ? { customerPhone: req.params.phone }
      : { customerId: req.user?.id };
    const orders = await Order.find(filter)
      .populate('shopId', 'shopName shopImage')
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── GET /api/orders/:orderId ─────────────────────────────────────
// Accepts both custom orderId ("ORD...") and MongoDB _id
router.get('/:orderId', auth(['customer', 'shop', 'delivery', 'admin']), async (req, res) => {
  try {
    const id = req.params.orderId;
    let order = await Order.findOne({ orderId: id })
      .populate('shopId', 'shopName shopImage phone address location')
      .populate('deliveryAgentId', 'name phone location vehicleType');
    if (!order) {
      order = await Order.findById(id)
        .populate('shopId', 'shopName shopImage phone address location')
        .populate('deliveryAgentId', 'name phone location vehicleType')
        .catch(() => null);
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── PUT /api/orders/:orderId/status ─────────────────────────────
router.put('/:orderId/status', auth(['shop', 'delivery', 'admin']), async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    const update = { orderStatus: status };
    if (status === 'cancelled') {
      update.cancelledAt = new Date();
      update.cancelReason = cancelReason || '';
    }
    if (status === 'delivered') {
      update.deliveredAt = new Date();
    }

    const order = await Order.findByIdAndUpdate(req.params.orderId, update, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (io) {
      io.to(`order:${order._id}`).emit('order:status', { orderId: order._id, status, order });
      io.to(`shop:${order.shopId}`).emit('order:updated', { order });
    }

    // On deliver: update revenue & rider stats
    if (status === 'delivered') {
      await Shop.findByIdAndUpdate(order.shopId, { $inc: { totalRevenue: order.shopEarnings } });
      if (order.deliveryAgentId) {
        await DeliveryAgent.findByIdAndUpdate(order.deliveryAgentId, {
          $inc: { totalDeliveries: 1, totalEarnings: order.deliveryEarnings },
          currentOrderId: null,
          isAvailable: true,
        });
      }
      await Customer.findByIdAndUpdate(order.customerId, { $inc: { totalSpent: order.totalPrice } });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── GET /api/orders/live-requests/pending ───────────────────────
router.get('/live-requests/pending', auth(['shop']), async (req, res) => {
  try {
    const orders = await Order.find({
      shopId:        req.user.id,
      liveRequested: true,
      isLive:        false,
      orderStatus:   { $nin: ['delivered', 'cancelled'] },
    }).sort({ updatedAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/orders/:orderId/request-live ──────────────────────
router.post('/:orderId/request-live', auth(['customer']), async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.orderId, { liveRequested: true }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (io) io.to(`shop:${order.shopId}`).emit('live:requested', { order });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/orders/:orderId/send-live-url ─────────────────────
router.post('/:orderId/send-live-url', auth(['shop']), async (req, res) => {
  try {
    const { liveUrl } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { isLive: true, liveStreamUrl: liveUrl },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (io) io.to(`order:${order._id}`).emit('live:url', { liveUrl });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/orders/:orderId/partner-busy ──────────────────────
router.post('/:orderId/partner-busy', auth(['shop']), async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (io) io.to(`order:${order._id}`).emit('live:busy', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/orders/:orderId/verify-otp ────────────────────────
router.post('/:orderId/verify-otp', auth(['delivery']), async (req, res) => {
  try {
    const { otp } = req.body;
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.deliveryOtp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    order.isOtpVerified = true;
    order.orderStatus   = 'delivered';
    order.deliveredAt   = new Date();
    await order.save();

    await Shop.findByIdAndUpdate(order.shopId, { $inc: { totalRevenue: order.shopEarnings } });
    if (order.deliveryAgentId) {
      await DeliveryAgent.findByIdAndUpdate(order.deliveryAgentId, {
        $inc: { totalDeliveries: 1, totalEarnings: order.deliveryEarnings },
        currentOrderId: null,
        isAvailable: true,
      });
    }
    await Customer.findByIdAndUpdate(order.customerId, { $inc: { totalSpent: order.totalPrice } });

    if (io) io.to(`order:${order._id}`).emit('order:status', { orderId: order._id, status: 'delivered', order });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
module.exports.setIO = setIO;
