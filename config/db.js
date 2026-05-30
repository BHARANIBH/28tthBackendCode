const mongoose = require('mongoose');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    console.log('✅ MongoDB Atlas connected');

    // Create geospatial indexes
    const Shop = require('../models/Shop');
    const DeliveryAgent = require('../models/DeliveryAgent');
    await Shop.collection.createIndex({ location: '2dsphere' }).catch(() => {});
    await DeliveryAgent.collection.createIndex({ location: '2dsphere' }).catch(() => {});
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

module.exports = connectDB;
