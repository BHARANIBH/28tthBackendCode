const router = require('express').Router();
const auth = require('../middleware/auth');
const Coupon = require('../models/Coupon');

// POST /api/coupons/validate
router.post('/validate', auth(['customer']), async (req, res) => {
  try {
    const { code, orderAmount, shopId } = req.body;

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ error: 'Invalid coupon code' });

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validTill) {
      return res.status(400).json({ error: 'Coupon expired' });
    }
    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ error: 'Coupon usage limit reached' });
    }
    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({ error: `Minimum order ₹${coupon.minOrderAmount} required` });
    }
    if (coupon.applicableShops.length > 0 && !coupon.applicableShops.includes(shopId)) {
      return res.status(400).json({ error: 'Coupon not valid for this shop' });
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = Math.round((orderAmount * coupon.discountValue) / 100);
      if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.discountValue;
    }

    res.json({ success: true, discount, coupon: { code: coupon.code, description: coupon.description } });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
