const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name:             { type: String, default: '' },
  phone:            { type: String, required: true, unique: true },
  email:            { type: String, default: '' },
  profileImage:     { type: String, default: '' },
  isPhoneVerified:  { type: Boolean, default: false },
  defaultAddressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address' },
  fcmToken:         { type: String, default: '' },
  orderCount:       { type: Number, default: 0 },
  totalSpent:       { type: Number, default: 0 },
  isActive:         { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
