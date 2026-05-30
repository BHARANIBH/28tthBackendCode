const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, required: true },
  userType:  { type: String, enum: ['customer', 'shop', 'delivery'], required: true },
  title:     { type: String, required: true },
  body:      { type: String, required: true },
  type:      { type: String, enum: ['order', 'payment', 'promo', 'system'], default: 'order' },
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  isRead:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
