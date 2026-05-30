const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  orderId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customerId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  shopId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  deliveryAgentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
  amount:            { type: Number, required: true },
  commissionAmount:  { type: Number, default: 0 },
  shopEarnings:      { type: Number, default: 0 },
  deliveryEarnings:  { type: Number, default: 0 },
  paymentMethod:     { type: String, default: 'cod' },
  paymentStatus:     { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  razorpayOrderId:   { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
