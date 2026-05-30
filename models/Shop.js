const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  shopId:       { type: String, unique: true },
  ownerName:    { type: String, required: true },
  phone:        { type: String, required: true, unique: true },
  email:        { type: String, default: '' },
  shopName:     { type: String, required: true },
  shopImage:    { type: String, default: '' },
  bannerImage:  { type: String, default: '' },

  address:      { type: String, required: true },
  city:         { type: String, default: 'Bangalore' },
  pincode:      { type: String, default: '' },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },

  categories:       { type: [String], default: ['broiler'] },
  openingTime:      { type: String, default: '08:00' },
  closingTime:      { type: String, default: '20:00' },
  isOpen:           { type: Boolean, default: false },
  isActive:         { type: Boolean, default: false }, // admin approved
  isPhoneVerified:  { type: Boolean, default: false },

  kycStatus:    { type: String, enum: ['pending', 'submitted', 'approved', 'rejected'], default: 'pending' },
  kycDocuments: { type: [String], default: [] },

  rating:         { type: Number, default: 0 },
  totalRatings:   { type: Number, default: 0 },
  totalOrders:    { type: Number, default: 0 },
  totalRevenue:   { type: Number, default: 0 },

  commissionRate:   { type: Number, default: 10 }, // percentage
  deliveryRadius:   { type: Number, default: 5 },  // km
  minOrderAmount:   { type: Number, default: 100 },
  avgDeliveryTime:  { type: Number, default: 30 }, // minutes

  fcmToken: { type: String, default: '' },

  bankDetails: {
    accountNumber: { type: String, default: '' },
    ifsc:          { type: String, default: '' },
    accountName:   { type: String, default: '' },
  },
}, { timestamps: true });

shopSchema.index({ location: '2dsphere' });

// Auto-generate shopId before save
shopSchema.pre('save', async function (next) {
  if (!this.shopId) {
    this.shopId = 'SHOP' + Date.now();
  }
  next();
});

module.exports = mongoose.model('Shop', shopSchema);
