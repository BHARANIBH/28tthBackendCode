/**
 * shopMatcher.js
 * Finds and ranks nearby available shops using the Haversine formula.
 * (No Google Maps API cost — works offline, accurate to ~0.5% for city distances)
 *
 * Swiggy/Zomato-style logic:
 *   1. Filter shops that are active, open, and within their own delivery radius
 *   2. Sort ascending by straight-line distance from customer
 *   3. Return up to MAX_CANDIDATES shops for the dispatch loop to try
 */

const Shop = require('../models/Shop');

const MAX_CANDIDATES = 5;   // try up to 5 nearest shops before giving up
const EARTH_R_KM    = 6371;

/**
 * Haversine distance between two [lat, lon] pairs — returns km
 */
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * findNearestShops(customerLat, customerLon)
 * Returns array of shop documents sorted by distance (nearest first).
 * Each doc has an extra `.distanceKm` field attached.
 *
 * If coordinates are [0,0] (no GPS — e.g. manual address entry or test mode),
 * all active open shops are returned sorted by rating so orders still dispatch.
 */
async function findNearestShops(customerLat, customerLon) {
  const noLocation = (customerLat === 0 && customerLon === 0)
                  || (!customerLat && !customerLon);

  if (noLocation) {
    // No GPS — return all active open shops sorted by rating (best first)
    console.log('[ShopMatcher] No customer location — returning all active shops');
    const allShops = await Shop.find({ isActive: true, isOpen: true }).lean();
    return allShops
      .map(shop => ({ ...shop, distanceKm: 0 }))   // unknown distance
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, MAX_CANDIDATES);
  }

  // Rough bounding box (±0.15° ≈ ±16 km) so Mongo only loads relevant docs
  const LAT_DELTA = 0.15;
  const LON_DELTA = 0.15;

  const shops = await Shop.find({
    isActive: true,
    isOpen:   true,
    'location.coordinates.1': { $gte: customerLat - LAT_DELTA, $lte: customerLat + LAT_DELTA },
    'location.coordinates.0': { $gte: customerLon - LON_DELTA, $lte: customerLon + LON_DELTA },
  }).lean();

  const withDistance = shops
    .map(shop => {
      const [lng, lat] = shop.location?.coordinates || [0, 0];
      const distanceKm = haversine(customerLat, customerLon, lat, lng);
      return { ...shop, distanceKm };
    })
    .filter(shop => shop.distanceKm <= (shop.deliveryRadius || 10))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_CANDIDATES);

  return withDistance;
}

/**
 * calculateDeliveryFee(distanceKm, subtotal)
 * Tiered like Blinkit / Zepto:
 *   Free   → subtotal ≥ ₹500
 *   ₹20    → 0–2 km
 *   ₹30    → 2–5 km
 *   ₹40    → 5–8 km
 *   ₹50    → >8 km
 */
function calculateDeliveryFee(distanceKm = 3, subtotal = 0) {
  if (subtotal >= 500) return 0;
  if (distanceKm <= 2)  return 20;
  if (distanceKm <= 5)  return 30;
  if (distanceKm <= 8)  return 40;
  return 50;
}

module.exports = { findNearestShops, calculateDeliveryFee, haversine };
