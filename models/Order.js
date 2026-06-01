const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId:          { type: String, unique: true },
  customerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  shopId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },  // set by dispatcher
  deliveryAgentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },

  customerName:  { type: String, required: true },
  customerPhone: { type: String, required: true },

  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name:      String,
    price:     Number,
    quantity:  Number,
    unit:      String,
    total:     Number,
    image:     String,
  }],

  deliveryAddress: {
    houseNo:   { type: String, default: '' },
    address:   { type: String, required: true },
    landmark:  { type: String, default: '' },
    pincode:   { type: String, default: '' },
    location: {
      type:        { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },

  subtotal:      { type: Number, required: true },
  deliveryCharge:{ type: Number, default: 30 },
  discount:      { type: Number, default: 0 },
  couponCode:    { type: String, default: '' },
  totalPrice:    { type: Number, required: true },

  // ── Commission / Settlement fields ──────────────────────────────
  orderAmount:          { type: Number, default: 0 },  // = subtotal (product total only)
  commissionPercentage: { type: Number, default: 10 }, // shop's commission rate (10-15%)
  commissionAmount:     { type: Number, default: 0 },  // orderAmount * commissionPercentage / 100
  platformFee:          { type: Number, default: 0 },  // same as commissionAmount (marketplace fee)
  shopSettlementAmount: { type: Number, default: 0 },  // orderAmount - commissionAmount
  deliveryEarnings:     { type: Number, default: 20 }, // platform share of delivery charge

  // Legacy aliases (kept for backward compatibility)
  commissionRate:       { type: Number, default: 10 },
  shopEarnings:         { type: Number, default: 0 },

  paymentMethod:     { type: String, enum: ['razorpay', 'cod'], default: 'cod' },
  paymentStatus:     { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  razorpayOrderId:   { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },

  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
  },

  deliveryOtp:   { type: String, default: '' },
  isOtpVerified: { type: Boolean, default: false },

  estimatedDeliveryTime: { type: Date },
  deliveredAt:           { type: Date },
  cancelledAt:           { type: Date },
  cancelReason:          { type: String, default: '' },

  deliverySlot: { type: String, default: '' },
  notes:        { type: String, default: '' },

  // Live chicken cutting feature
  liveRequested: { type: Boolean, default: false },
  isLive:        { type: Boolean, default: false },
  liveStreamUrl: { type: String, default: '' },

  // Dispatch engine tracking (Swiggy-style waterfall)
  dispatchStatus: {
    type: String,
    enum: ['idle', 'searching', 'accepted', 'rejected', 'timeout', 'no_shops'],
    default: 'idle',
  },
  dispatchAttempts: [{
    shopId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName:   String,
    distanceKm: Number,
    attemptedAt:{ type: Date, default: Date.now },
    status:     { type: String, enum: ['notified', 'accepted', 'rejected', 'timeout'], default: 'notified' },
    reason:     { type: String, default: '' },
  }],

  // Fees
  packagingFee:   { type: Number, default: 10 },
  tax:            { type: Number, default: 0 },  // Fresh chicken = 0% GST in India
  couponDiscount: { type: Number, default: 0 },

  isRated: { type: Boolean, default: false },
}, { timestamps: true });

orderSchema.pre('save', function (next) {
  if (!this.orderId) {
    this.orderId = 'ORD' + Date.now();
  }
  // Always set orderAmount = subtotal (product total only, excludes delivery)
  if (this.subtotal) {
    this.orderAmount = this.subtotal;
  }
  // Calculate commission on product subtotal only (not delivery charge)
  const pct = this.commissionPercentage || this.commissionRate || 10;
  if (this.orderAmount) {
    this.commissionAmount     = Math.round((this.orderAmount * pct) / 100);
    this.platformFee          = this.commissionAmount;
    this.shopSettlementAmount = this.orderAmount - this.commissionAmount;
    // Legacy aliases
    this.commissionRate       = pct;
    this.shopEarnings         = this.shopSettlementAmount;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
