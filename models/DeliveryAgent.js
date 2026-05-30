const mongoose = require('mongoose');

const deliveryAgentSchema = new mongoose.Schema({
  agentId:       { type: String, unique: true },
  name:          { type: String, required: true },
  phone:         { type: String, required: true, unique: true },
  email:         { type: String, default: '' },
  profileImage:  { type: String, default: '' },
  vehicleType:   { type: String, enum: ['bike', 'scooter', 'bicycle'], default: 'bike' },
  vehicleNumber: { type: String, default: '' },

  isActive:        { type: Boolean, default: false }, // admin approved
  isOnline:        { type: Boolean, default: false },
  isAvailable:     { type: Boolean, default: true },
  isPhoneVerified: { type: Boolean, default: false },

  currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },

  totalDeliveries: { type: Number, default: 0 },
  totalEarnings:   { type: Number, default: 0 },
  rating:          { type: Number, default: 0 },
  totalRatings:    { type: Number, default: 0 },
  fcmToken:        { type: String, default: '' },

  bankDetails: {
    accountNumber: { type: String, default: '' },
    ifsc:          { type: String, default: '' },
    accountName:   { type: String, default: '' },
  },
}, { timestamps: true });

deliveryAgentSchema.index({ location: '2dsphere' });

deliveryAgentSchema.pre('save', function (next) {
  if (!this.agentId) {
    this.agentId = 'DEL' + Date.now();
  }
  next();
});

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);
