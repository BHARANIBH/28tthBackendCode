const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  shopId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  name:            { type: String, required: true },
  description:     { type: String, default: '' },
  category:        { type: String, enum: ['broiler', 'country', 'eggs', 'marinated', 'curry-cut', 'boneless', 'wings', 'liver', 'other'], default: 'broiler' },
  price:           { type: Number, required: true },
  originalPrice:   { type: Number, default: 0 },
  unit:            { type: String, enum: ['kg', 'piece', 'dozen', '500g', '250g'], default: 'kg' },
  minQuantity:     { type: Number, default: 0.5 },
  maxQuantity:     { type: Number, default: 10 },
  image:           { type: String, default: '' },
  isAvailable:     { type: Boolean, default: true },
  discount:        { type: Number, default: 0 },
  isHit:           { type: Boolean, default: false },
  preparationTime: { type: Number, default: 15 },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
