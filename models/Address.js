const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  name:     { type: String, default: '' },
  phone:    { type: String, default: '' },
  houseNo:  { type: String, default: '' },
  pincode:  { type: String, default: '' },
  address:  { type: String, required: true },
  saveAs:   { type: String, default: 'Home' },
  landmark: { type: String, default: '' },
  lat:      { type: Number },
  lng:      { type: Number },
  createdAt:{ type: Date, default: Date.now },
});

module.exports = mongoose.model('Address', addressSchema);
