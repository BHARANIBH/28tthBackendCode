/**
 * coupons.js — Coupon validation & discount calculation
 * Add new coupons here. Backend is the source of truth (never trust client).
 */

const COUPONS = {
  FRESH10:  { type: 'percent', value: 10, minOrder: 100,  maxDiscount: 80,  desc: '10% off your order' },
  FIRST50:  { type: 'flat',    value: 50, minOrder: 200,  maxDiscount: 50,  desc: '₹50 off (first order)' },
  WELCOME:  { type: 'percent', value: 15, minOrder: 150,  maxDiscount: 100, desc: '15% off — welcome gift' },
  LIVE20:   { type: 'percent', value: 20, minOrder: 250,  maxDiscount: 150, desc: '20% off when you watch live cut' },
  CHICKEN5: { type: 'flat',    value: 5,  minOrder: 100,  maxDiscount: 5,   desc: '₹5 off on any order' },
  GONAATU:  { type: 'percent', value: 12, minOrder: 180,  maxDiscount: 90,  desc: '12% off — GoNaatu special' },
};

/**
 * validateCoupon(code, subtotal)
 * Returns { valid, discount, message }
 */
function validateCoupon(code = '', subtotal = 0) {
  const coupon = COUPONS[(code || '').trim().toUpperCase()];

  if (!coupon) {
    return { valid: false, discount: 0, message: 'Invalid coupon code' };
  }

  if (subtotal < coupon.minOrder) {
    return {
      valid:    false,
      discount: 0,
      message:  `Minimum order ₹${coupon.minOrder} required for this coupon`,
    };
  }

  let discount =
    coupon.type === 'percent'
      ? Math.round((subtotal * coupon.value) / 100)
      : coupon.value;

  discount = Math.min(discount, coupon.maxDiscount);

  return {
    valid:    true,
    discount,
    message:  `${coupon.desc} — ₹${discount} saved!`,
    coupon,
  };
}

module.exports = { validateCoupon, COUPONS };
