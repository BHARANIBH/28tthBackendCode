/**
 * orderDispatcher.js
 * ─────────────────────────────────────────────────────────────────
 * Swiggy / Zomato / Blinkit-style order dispatch engine.
 *
 * TIMEOUTS  (based on real app behaviour analysis)
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Swiggy restaurant   90 s  (chain to next on timeout)        │
 * │  Zomato restaurant   90 s  (customer sees live countdown)    │
 * │  Blinkit dark-store  30 s  (auto-accept on most stores)      │
 * │  Zepto dark-store    20 s  (instant availability check)      │
 * │  GoNaatu shop (live  60 s  ← chosen: physical shop, knife  │
 * │  chicken cutting)          work, needs short decision time)  │
 * │  Delivery rider      45 s  (Swiggy/Zomato rider window)      │
 * └──────────────────────────────────────────────────────────────┘
 *
 * FLOW
 *   Order placed
 *     → findNearestShops() → sorted list [S1, S2, S3 …]
 *     → notify S1 via socket  (join `shop:<id>`)
 *     → wait 60 s
 *       ├─ ACCEPT  → mark order confirmed → notify customer
 *       │            → assignNearestRider()
 *       ├─ REJECT  → try S2
 *       └─ TIMEOUT → try S2
 *     → if all shops exhausted → cancel order, refund
 *
 *   Shop accepts
 *     → findNearestRider()
 *     → notify rider via socket  (join `delivery:<id>`)
 *     → wait 45 s
 *       ├─ ACCEPT  → assign, customer sees live tracking
 *       ├─ REJECT  → try next rider
 *       └─ TIMEOUT → try next rider
 *     → if all riders exhausted → order stays accepted, admin assigns manually
 */

const Order        = require('../models/Order');
const Shop         = require('../models/Shop');
const DeliveryAgent= require('../models/DeliveryAgent');
const { findNearestShops } = require('./shopMatcher');

// ── Timing constants ────────────────────────────────────────────
const SHOP_TIMEOUT_MS  = 60_000;   // 60 s — physical chicken shop
const RIDER_TIMEOUT_MS = 45_000;   // 45 s — delivery rider
const MAX_SHOP_TRIES   = 5;        // stop after 5 shops
const MAX_RIDER_TRIES  = 3;        // stop after 3 riders

// ── Active dispatch timers (orderId → timeoutHandle) ────────────
const activeTimers = new Map();

let io; // injected from server.js
function setIO(socketIO) { io = socketIO; }

// ── Helpers ─────────────────────────────────────────────────────
function emitToCustomer(orderId, event, payload) {
  if (io) io.to(`order:${orderId}`).emit(event, payload);
}

function emitToShop(shopId, event, payload) {
  if (io) io.to(`shop:${shopId}`).emit(event, payload);
}

function emitToRider(riderId, event, payload) {
  if (io) io.to(`delivery:${riderId}`).emit(event, payload);
}

function clearTimer(orderId) {
  const t = activeTimers.get(orderId);
  if (t) { clearTimeout(t); activeTimers.delete(orderId); }
}

// ────────────────────────────────────────────────────────────────
//  SHOP DISPATCH LOOP
// ────────────────────────────────────────────────────────────────
async function dispatchToShop(order, nearbyShops, attemptIndex = 0) {
  if (attemptIndex >= nearbyShops.length || attemptIndex >= MAX_SHOP_TRIES) {
    // All shops exhausted
    await Order.findByIdAndUpdate(order._id, {
      orderStatus:    'cancelled',
      cancelReason:   'No shops available in your area right now. Please try again shortly.',
      cancelledAt:    new Date(),
      dispatchStatus: 'no_shops',
    });

    emitToCustomer(order._id, 'order:cancelled', {
      reason: 'No shops available in your area right now. Please try again shortly.',
    });

    console.log(`[Dispatch] Order ${order.orderId} — no shops available after ${attemptIndex} attempts`);
    return;
  }

  const shop = nearbyShops[attemptIndex];
  const shopId = shop._id.toString();

  console.log(`[Dispatch] Order ${order.orderId} → Shop ${shop.shopName} (${shop.distanceKm?.toFixed(1)} km) attempt ${attemptIndex + 1}`);

  // Record this dispatch attempt
  await Order.findByIdAndUpdate(order._id, {
    shopId:         shop._id,
    dispatchStatus: 'searching',
    $push: {
      dispatchAttempts: {
        shopId:      shop._id,
        shopName:    shop.shopName,
        distanceKm:  shop.distanceKm,
        attemptedAt: new Date(),
        status:      'notified',
      },
    },
  });

  // Notify shop
  emitToShop(shopId, 'order:new-request', {
    order,
    shop,
    timeoutSeconds: SHOP_TIMEOUT_MS / 1000,
    distanceKm:     shop.distanceKm,
  });

  // Notify customer that we're searching
  emitToCustomer(order._id, 'order:searching', {
    message:    'Finding the nearest shop…',
    shopNumber: attemptIndex + 1,
  });

  // Start 60-second timeout
  const timer = setTimeout(async () => {
    activeTimers.delete(order._id.toString());
    console.log(`[Dispatch] Order ${order.orderId} — Shop ${shop.shopName} timed out. Trying next.`);

    // Mark this attempt as timed out
    await Order.findByIdAndUpdate(order._id, {
      $set: { 'dispatchAttempts.$[elem].status': 'timeout' },
    }, {
      arrayFilters: [{ 'elem.shopId': shop._id, 'elem.status': 'notified' }],
    });

    // Notify shop their window expired
    emitToShop(shopId, 'order:request-expired', { orderId: order._id });

    // Try next shop
    await dispatchToShop(order, nearbyShops, attemptIndex + 1);
  }, SHOP_TIMEOUT_MS);

  activeTimers.set(order._id.toString(), timer);
}

// ── Called when shop ACCEPTS ─────────────────────────────────────
async function shopAccepted(orderId, shopId) {
  clearTimer(orderId);

  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      orderStatus:    'confirmed',
      dispatchStatus: 'accepted',
      $set: { 'dispatchAttempts.$[elem].status': 'accepted' },
    },
    {
      new: true,
      arrayFilters: [{ 'elem.shopId': shopId, 'elem.status': 'notified' }],
    }
  );

  if (!order) return;

  console.log(`[Dispatch] Order ${order.orderId} — ACCEPTED by shop ${shopId}`);

  emitToCustomer(orderId, 'order:confirmed', {
    orderId,
    status:  'confirmed',
    message: 'Your order has been accepted! Preparing now…',
  });

  emitToCustomer(orderId, 'order:status', {
    orderId,
    status: 'confirmed',
    order,
  });

  // Now assign a delivery rider
  await dispatchToRider(order);
}

// ── Called when shop REJECTS ─────────────────────────────────────
async function shopRejected(orderId, shopId, reason = '') {
  clearTimer(orderId);

  const order = await Order.findById(orderId);
  if (!order) return;

  console.log(`[Dispatch] Order ${order.orderId} — REJECTED by shop ${shopId}: ${reason}`);

  await Order.findByIdAndUpdate(orderId, {
    $set: { 'dispatchAttempts.$[elem].status': 'rejected', 'dispatchAttempts.$[elem].reason': reason },
  }, {
    arrayFilters: [{ 'elem.shopId': shopId, 'elem.status': 'notified' }],
  });

  // Inform customer, try next shop
  emitToCustomer(orderId, 'order:searching', {
    message: 'Finding another shop…',
  });

  const [lat, lon] = [
    order.deliveryAddress?.location?.coordinates?.[1] || 0,
    order.deliveryAddress?.location?.coordinates?.[0] || 0,
  ];

  const nearbyShops = await findNearestShops(lat, lon);
  const alreadyTried = order.dispatchAttempts.map(a => a.shopId.toString());
  const remaining = nearbyShops.filter(s => !alreadyTried.includes(s._id.toString()));

  await dispatchToShop(order, remaining, 0);
}

// ────────────────────────────────────────────────────────────────
//  RIDER DISPATCH LOOP
// ────────────────────────────────────────────────────────────────
async function findNearestRiders(shopLat, shopLon) {
  const riders = await DeliveryAgent.find({
    isActive:    true,
    isOnline:    true,
    isAvailable: true,
    currentOrderId: null,
  }).lean();

  return riders
    .map(r => {
      const [lng, lat] = r.location?.coordinates || [0, 0];
      const dist = Math.sqrt((lat - shopLat) ** 2 + (lng - shopLon) ** 2);
      return { ...r, distApprox: dist };
    })
    .sort((a, b) => a.distApprox - b.distApprox)
    .slice(0, MAX_RIDER_TRIES);
}

async function dispatchToRider(order, triedRiders = []) {
  const shop = await Shop.findById(order.shopId).lean();
  const [shopLng, shopLat] = shop?.location?.coordinates || [0, 0];

  const riders = await findNearestRiders(shopLat, shopLng);
  const available = riders.filter(r => !triedRiders.includes(r._id.toString()));

  if (!available.length) {
    console.log(`[Dispatch] Order ${order.orderId} — no riders available, staying in queue`);
    emitToCustomer(order._id, 'order:status', {
      orderId: order._id,
      status:  'confirmed',
      message: 'Confirmed! Waiting for a delivery partner…',
      order,
    });
    return;
  }

  const rider = available[0];
  const riderId = rider._id.toString();

  console.log(`[Dispatch] Order ${order.orderId} → Rider ${rider.name}`);

  emitToRider(riderId, 'delivery:new-request', {
    order,
    shop,
    timeoutSeconds: RIDER_TIMEOUT_MS / 1000,
  });

  const timerKey = `${order._id}_rider`;
  const timer = setTimeout(async () => {
    activeTimers.delete(timerKey);
    console.log(`[Dispatch] Order ${order.orderId} — rider ${rider.name} timed out`);
    await dispatchToRider(order, [...triedRiders, riderId]);
  }, RIDER_TIMEOUT_MS);

  activeTimers.set(timerKey, timer);
}

// ── Called when rider ACCEPTS ────────────────────────────────────
async function riderAccepted(orderId, riderId) {
  clearTimer(`${orderId}_rider`);

  await DeliveryAgent.findByIdAndUpdate(riderId, {
    currentOrderId: orderId,
    isAvailable:    false,
  });

  const order = await Order.findByIdAndUpdate(
    orderId,
    { deliveryAgentId: riderId, orderStatus: 'preparing' },
    { new: true }
  ).populate('deliveryAgentId', 'name phone location vehicleType');

  if (!order) return;

  emitToCustomer(orderId, 'order:rider-assigned', {
    orderId,
    rider: order.deliveryAgentId,
    message: 'Delivery partner assigned!',
  });

  emitToCustomer(orderId, 'order:status', {
    orderId,
    status: 'preparing',
    order,
  });
}

// ── Called when rider REJECTS ────────────────────────────────────
async function riderRejected(orderId, riderId) {
  clearTimer(`${orderId}_rider`);
  const order = await Order.findById(orderId);
  if (!order) return;
  const currentTried = order.dispatchAttempts?.map(a => a.shopId?.toString()) || [];
  await dispatchToRider(order, [riderId]);
}

// ── Entry point: called from orderRoutes when order is placed ────
async function startDispatch(order, customerLat, customerLon) {
  try {
    const nearbyShops = await findNearestShops(customerLat, customerLon);

    if (!nearbyShops.length) {
      await Order.findByIdAndUpdate(order._id, {
        orderStatus:    'cancelled',
        cancelReason:   'No shops available near your location.',
        cancelledAt:    new Date(),
        dispatchStatus: 'no_shops',
      });
      emitToCustomer(order._id, 'order:cancelled', {
        reason: 'No shops available near your location. Please try again later.',
      });
      return;
    }

    await dispatchToShop(order, nearbyShops, 0);
  } catch (err) {
    console.error('[Dispatch] startDispatch error:', err);
  }
}

module.exports = {
  setIO,
  startDispatch,
  shopAccepted,
  shopRejected,
  riderAccepted,
  riderRejected,
};
