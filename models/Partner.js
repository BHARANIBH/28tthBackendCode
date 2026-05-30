const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  phone:          { type: String, required: true, unique: true },
  restaurantName: { type: String, required: true },
  address:        { type: String, default: '' },
  isActive:       { type: Boolean, default: true },
  isPhoneVerified:{ type: Boolean, default: false },
  totalOrders:    { type: Number, default: 0 },
  createdAt:      { type: Date, default: Date.now },
  lastLogin:      { type: Date, default: Date.now },

  // Shop GPS coordinates — set via Google Places Autocomplete in partner portal
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },  // [longitude, latitude]
  },
  isLocationSet:  { type: Boolean, default: false },
  isNewPartner:   { type: Boolean, default: true },     // shown location step on first login
});

module.exports = mongoose.model('Partner', partnerSchema);
