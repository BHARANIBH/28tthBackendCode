const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code:           { type: String, required: true, unique: true, uppercase: true },
  description:    { type: String, default: '' },
  discountType:   { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue:  { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount:    { type: Number, default: 0 },
  usageLimit:     { type: Number, default: 100 },
  usedCount:      { type: Number, default: 0 },
  validFrom:      { type: Date, required: true },
  validTill:      { type: Date, required: true },
  isActive:       { type: Boolean, default: true },
  applicableShops:{ type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
