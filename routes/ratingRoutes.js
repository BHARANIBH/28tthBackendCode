const router = require('express').Router();
const auth = require('../middleware/auth');
const Rating = require('../models/Rating');
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const DeliveryAgent = require('../models/DeliveryAgent');

// POST /api/ratings
router.post('/', auth(['customer']), async (req, res) => {
  try {
    const { orderId, shopRating, deliveryRating, review } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.isRated) return res.status(400).json({ error: 'Already rated' });
    if (order.orderStatus !== 'delivered') return res.status(400).json({ error: 'Order not delivered yet' });

    const rating = await Rating.create({
      orderId,
      customerId: req.user.id,
      shopId: order.shopId,
      deliveryAgentId: order.deliveryAgentId,
      shopRating,
      deliveryRating,
      review: review || '',
    });

    await Order.findByIdAndUpdate(orderId, { isRated: true });

    // Update shop average rating
    const shop = await Shop.findById(order.shopId);
    const newTotal = shop.totalRatings + 1;
    const newRating = ((shop.rating * shop.totalRatings) + shopRating) / newTotal;
    await Shop.findByIdAndUpdate(order.shopId, { rating: newRating.toFixed(1), totalRatings: newTotal });

    // Update delivery agent rating
    if (order.deliveryAgentId && deliveryRating) {
      const agent = await DeliveryAgent.findById(order.deliveryAgentId);
      if (agent) {
        const aTotal = agent.totalRatings + 1;
        const aRating = ((agent.rating * agent.totalRatings) + deliveryRating) / aTotal;
        await DeliveryAgent.findByIdAndUpdate(order.deliveryAgentId, { rating: aRating.toFixed(1), totalRatings: aTotal });
      }
    }

    res.json({ success: true, rating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// GET /api/ratings/shop/:shopId
router.get('/shop/:shopId', async (req, res) => {
  try {
    const ratings = await Rating.find({ shopId: req.params.shopId })
      .populate('customerId', 'name')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, ratings });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
