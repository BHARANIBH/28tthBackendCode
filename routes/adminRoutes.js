const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const DeliveryAgent = require('../models/DeliveryAgent');
const Product = require('../models/Product');
const Banner = require('../models/Banner');
const Coupon = require('../models/Coupon');
const Transaction = require('../models/Transaction');

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === 'admin') { req.user = decoded; return next(); }
    } catch {}
  }
  // fallback: password-based for web admin panel
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token });
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [orders, todayOrders, customers, shops, delivery, revenue] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Customer.countDocuments(),
      Shop.countDocuments({ isActive: true }),
      DeliveryAgent.countDocuments({ isActive: true }),
      Transaction.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$commissionAmount' } } },
      ]),
    ]);
    res.json({ success: true, stats: { orders, todayOrders, customers, shops, delivery, revenue: revenue[0]?.total || 0 } });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/orders
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status, page = 1 } = req.query;
    const filter = status ? { orderStatus: status } : {};
    const orders = await Order.find(filter)
      .populate('shopId', 'shopName')
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(50)
      .skip((page - 1) * 50);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/orders/:orderId
router.put('/orders/:orderId', adminAuth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.orderId, req.body, { new: true });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/shops
router.get('/shops', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status === 'pending' ? { isActive: false } : status === 'active' ? { isActive: true } : {};
    const shops = await Shop.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, shops });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/shops/:id/approve
router.put('/shops/:id/approve', adminAuth, async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isActive: true, kycStatus: 'approved' }, { new: true });
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/shops/:id/reject
router.put('/shops/:id/reject', adminAuth, async (req, res) => {
  try {
    const shop = await Shop.findByIdAndUpdate(req.params.id, { isActive: false, kycStatus: 'rejected' }, { new: true });
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/delivery-agents
router.get('/delivery-agents', adminAuth, async (req, res) => {
  try {
    const agents = await DeliveryAgent.find().sort({ createdAt: -1 });
    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/delivery-agents/:id/approve
router.put('/delivery-agents/:id/approve', adminAuth, async (req, res) => {
  try {
    const agent = await DeliveryAgent.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/customers
router.get('/customers', adminAuth, async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, customers });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ── GET /api/admin/settlements — Commission & settlement report ────
// Query params: ?from=2024-01-01&to=2024-12-31&shopId=xxx
router.get('/settlements', adminAuth, async (req, res) => {
  try {
    const { from, to, shopId } = req.query;
    const match = {
      orderStatus:  { $nin: ['cancelled', 'pending'] },
      shopId:       { $ne: null, $exists: true },
    };
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to)   match.createdAt.$lte = new Date(to + 'T23:59:59');
    }
    if (shopId) match.shopId = require('mongoose').Types.ObjectId(shopId);

    // Per-shop aggregation
    const shopSettlements = await Order.aggregate([
      { $match: match },
      { $group: {
          _id:              '$shopId',
          totalOrders:      { $sum: 1 },
          grossSales:       { $sum: '$orderAmount' },
          commissionTotal:  { $sum: '$commissionAmount' },
          netPayable:       { $sum: '$shopSettlementAmount' },
          avgCommissionPct: { $avg: '$commissionPercentage' },
          deliveryCharges:  { $sum: '$deliveryCharge' },
      }},
      { $lookup: {
          from:         'shops',
          localField:   '_id',
          foreignField: '_id',
          as:           'shop',
      }},
      { $unwind: { path: '$shop', preserveNullAndEmpty: true } },
      { $project: {
          shopName:        { $ifNull: ['$shop.shopName', 'Unknown Shop'] },
          shopPhone:       '$shop.phone',
          currentCommissionRate: '$shop.commissionRate',
          totalOrders:     1,
          grossSales:      1,
          commissionTotal: 1,
          netPayable:      1,
          avgCommissionPct:{ $round: ['$avgCommissionPct', 2] },
          deliveryCharges: 1,
      }},
      { $sort: { grossSales: -1 } },
    ]);

    // Platform-wide totals
    const totals = shopSettlements.reduce((acc, s) => ({
      totalOrders:     acc.totalOrders     + s.totalOrders,
      grossSales:      acc.grossSales      + s.grossSales,
      commissionTotal: acc.commissionTotal + s.commissionTotal,
      netPayable:      acc.netPayable      + s.netPayable,
    }), { totalOrders: 0, grossSales: 0, commissionTotal: 0, netPayable: 0 });

    res.json({ success: true, settlements: shopSettlements, totals });
  } catch (err) {
    console.error('[settlements]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/settlements/:shopId — single shop detail ────────
router.get('/settlements/:shopId', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find({
      shopId:      req.params.shopId,
      orderStatus: { $nin: ['cancelled', 'pending'] },
    })
    .select('orderId createdAt orderAmount commissionPercentage commissionAmount shopSettlementAmount deliveryCharge totalPrice orderStatus customerName')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/shops/:shopId/commission — update commission rate ─
router.put('/shops/:shopId/commission', adminAuth, async (req, res) => {
  try {
    const { commissionRate } = req.body;
    if (commissionRate < 10 || commissionRate > 15) {
      return res.status(400).json({ error: 'Commission must be between 10% and 15%' });
    }
    const shop = await Shop.findByIdAndUpdate(
      req.params.shopId,
      { commissionRate },
      { new: true, runValidators: false }
    );
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ success: true, shop: { _id: shop._id, shopName: shop.shopName, commissionRate: shop.commissionRate } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find().populate('shopId', 'shopName').sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Banners
router.get('/banners', async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ position: 1 });
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/banners', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.create(req.body);
    res.json({ success: true, banner });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/banners/:id', adminAuth, async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Coupons
router.get('/coupons', adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/coupons', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

router.put('/coupons/:id', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/admin/commission — update shop commission rate
router.put('/commission/:shopId', adminAuth, async (req, res) => {
  try {
    const { commissionRate } = req.body;
    const shop = await Shop.findByIdAndUpdate(req.params.shopId, { commissionRate }, { new: true });
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
