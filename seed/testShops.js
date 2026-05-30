/**
 * Seed script — insert test shops for dispatch testing
 * Run once:  node seed/testShops.js
 *
 * Safe to re-run: uses updateOne + upsert so it won't duplicate.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Shop     = require('../models/Shop');

// ─── Test shops ──────────────────────────────────────────────────────────────
// Add as many shops as you need here. Coordinates from Google Maps URLs.
// Format: @LAT,LNG in the URL  → lat first, lng second

const TEST_SHOPS = [
  {
    shopName:   'Teju Chicken Corner',
    ownerName:  'Teju',
    phone:      '9380005746',
    email:      '',
    address:    'Teju Chicken Corner, Bangalore',
    city:       'Bangalore',
    pincode:    '560022',
    location: {
      type:        'Point',
      coordinates: [77.5612665, 13.0029364],  // [longitude, latitude]  ← GeoJSON order
    },
    categories:      ['broiler'],
    openingTime:     '08:00',
    closingTime:     '21:00',
    isOpen:          true,    // ← must be true for dispatch to find it
    isActive:        true,    // ← must be true for dispatch to find it
    isPhoneVerified: true,
    kycStatus:       'approved',
    rating:          4.5,
    deliveryRadius:  8,       // km — shop will accept orders within 8 km
    minOrderAmount:  100,
    avgDeliveryTime: 30,
    commissionRate:  10,
  },

  {
    shopName:   'Best Chicken Center',
    ownerName:  'Best Chicken Center Owner',
    phone:      '9380005747',
    email:      '',
    address:    'Best Chicken Center, Bangalore',
    city:       'Bangalore',
    pincode:    '560022',
    location: {
      type:        'Point',
      coordinates: [77.5601104, 13.0074599],  // [lng, lat]
    },
    categories:      ['broiler'],
    openingTime:     '08:00',
    closingTime:     '21:00',
    isOpen:          true,
    isActive:        true,
    isPhoneVerified: true,
    kycStatus:       'approved',
    rating:          4.3,
    deliveryRadius:  8,
    minOrderAmount:  100,
    avgDeliveryTime: 30,
    commissionRate:  10,
  },

  {
    shopName:   "Leon's Burgers & Wings Rajajinagar",
    ownerName:  "Leon's Owner",
    phone:      '9380005748',
    email:      '',
    address:    "Leon's Burgers & Wings, Rajajinagar, Bangalore",
    city:       'Bangalore',
    pincode:    '560010',
    location: {
      type:        'Point',
      coordinates: [77.5478318, 12.9973307],  // [lng, lat]
    },
    categories:      ['broiler'],
    openingTime:     '08:00',
    closingTime:     '21:00',
    isOpen:          true,
    isActive:        true,
    isPhoneVerified: true,
    kycStatus:       'approved',
    rating:          4.1,
    deliveryRadius:  8,
    minOrderAmount:  100,
    avgDeliveryTime: 30,
    commissionRate:  10,
  },
];

// ─── Run ─────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  for (const shopData of TEST_SHOPS) {
    const result = await Shop.updateOne(
      { phone: shopData.phone },   // match by phone — won't duplicate on re-run
      { $set: shopData },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      console.log(`➕ Inserted: ${shopData.shopName} (${shopData.phone})`);
    } else {
      console.log(`🔄 Updated:  ${shopData.shopName} (${shopData.phone})`);
    }
  }

  console.log('\n📍 Shop coordinates in DB:');
  const shops = await Shop.find({ isActive: true }).select('shopName location deliveryRadius isOpen');
  shops.forEach(s => {
    const [lng, lat] = s.location?.coordinates || [0, 0];
    console.log(`  • ${s.shopName} → lat:${lat} lng:${lng} | radius:${s.deliveryRadius}km | open:${s.isOpen}`);
  });

  await mongoose.disconnect();
  console.log('\n✅ Done — shops are ready for dispatch testing.');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
