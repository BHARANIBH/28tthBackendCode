const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  orderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  shopId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  deliveryAgentId:{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
  shopRating:     { type: Number, min: 1, max: 5, required: true },
  deliveryRating: { type: Number, min: 1, max: 5 },
  review:         { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Rating', ratingSchema);
