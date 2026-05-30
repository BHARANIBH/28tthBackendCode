const router = require('express').Router();
const auth = require('../middleware/auth');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');

// GET /api/shops/nearby?lat=&lng=&radius=5
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    const shops = await Shop.find({
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseFloat(radius) * 1000,
        },
      },
    }).select('-bankDetails -fcmToken -kycDocuments');

    res.json({ success: true, shops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch nearby shops' });
  }
});

// GET /api/shops/:shopId — public shop detail
router.get('/:shopId', async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.shopId).select('-bankDetails -fcmToken -kycDocuments');
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// GET /api/shops/:shopId/products — public
router.get('/:shopId/products', async (req, res) => {
  try {
    const products = await Product.find({ shopId: req.params.shopId, isAvailable: true });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── Partner-only routes below ──────────────────────────────────────────────

// GET /api/shops/partner/profile
router.get('/partner/profile', auth(['shop']), async (req, res) => {
  try {
    const shop = await Shop.findById(req.user.id).select('-fcmToken');
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// PUT /api/shops/partner/profile
router.put('/partner/profile', auth(['shop']), async (req, res) => {
  try {
    const allowed = ['shopName', 'ownerName', 'address', 'city', 'pincode', 'openingTime', 'closingTime', 'minOrderAmount', 'avgDeliveryTime', 'location', 'categories'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const shop = await Shop.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ success: true, shop });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/shops/partner/status — toggle open/close
router.put('/partner/status', auth(['shop']), async (req, res) => {
  try {
    const { isOpen } = req.body;
    const shop = await Shop.findByIdAndUpdate(req.user.id, { isOpen }, { new: true });
    res.json({ success: true, isOpen: shop.isOpen });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/shops/partner/products
router.get('/partner/products', auth(['shop']), async (req, res) => {
  try {
    const products = await Product.find({ shopId: req.user.id });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/shops/partner/products
router.post('/partner/products', auth(['shop']), async (req, res) => {
  try {
    const product = await Product.create({ ...req.body, shopId: req.user.id });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/shops/partner/products/:id
router.put('/partner/products/:id', auth(['shop']), async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shopId: req.user.id },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/shops/partner/products/:id
router.delete('/partner/products/:id', auth(['shop']), async (req, res) => {
  try {
    await Product.findOneAndDelete({ _id: req.params.id, shopId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/shops/partner/orders
router.get('/partner/orders', auth(['shop']), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { shopId: req.user.id };
    if (status) filter.orderStatus = status;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/shops/partner/live-requests
router.get('/partner/live-requests', auth(['shop']), async (req, res) => {
  try {
    const orders = await Order.find({ shopId: req.user.id, liveRequested: true, isLive: false });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/shops/partner/stats
router.get('/partner/stats', auth(['shop']), async (req, res) => {
  try {
    const shopId = req.user.id;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [total, todayOrders, pending, revenue] = await Promise.all([
      Order.countDocuments({ shopId }),
      Order.countDocuments({ shopId, createdAt: { $gte: today } }),
      Order.countDocuments({ shopId, orderStatus: 'pending' }),
      Order.aggregate([
        { $match: { shopId: require('mongoose').Types.ObjectId.createFromHexString(shopId), orderStatus: 'delivered' } },
        { $group: { _id: null, total: { $sum: '$shopEarnings' } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders: total,
        todayOrders,
        pendingOrders: pending,
        totalEarnings: revenue[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
