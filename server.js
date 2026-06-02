const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(cors());

// DB
require('./config/db')();

// Routes
const authRoutes     = require('./routes/authRoutes');
const partnerRoutes  = require('./routes/partnerRoutes');
const shopRoutes     = require('./routes/shopRoutes');
const orderRoutes    = require('./routes/orderRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const adminRoutes    = require('./routes/adminRoutes');
const paymentRoutes  = require('./routes/paymentRoutes');
const addressRoutes  = require('./routes/addressRoutes');
const ratingRoutes   = require('./routes/ratingRoutes');
const couponRoutes   = require('./routes/couponRoutes');

// Pass io to route modules that need it
orderRoutes.setIO(io);
deliveryRoutes.setIO(io);
partnerRoutes.setIO(io);

app.use('/api/auth',     authRoutes);
app.use('/api/partner',  partnerRoutes);   // ← partner login, orders, earnings
app.use('/api/otp',      require('./routes/otpRoutes'));
app.use('/api/shops',    shopRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/addresses',addressRoutes);
app.use('/api/ratings',  ratingRoutes);
app.use('/api/coupons',  couponRoutes);

// Config endpoints
app.get('/api/ping',           (req, res) => res.json({ status: 'ok' }));
app.get('/api/config/maps',    (req, res) => res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' }));
app.get('/api/config/payment', (req, res) => res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID || '' }));

// ── Dev seed endpoint — open in browser to insert test shops ─────────────────
app.get('/api/dev/seed-shops', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  const Shop = require('./models/Shop');
  const TEST_SHOPS = [
    {
      shopName:'Teju Chicken Corner', ownerName:'Teju', phone:'9380005746',
      address:'Teju Chicken Corner, Bangalore', city:'Bangalore', pincode:'560022',
      location:{ type:'Point', coordinates:[77.5612665, 13.0029364] },
      categories:['broiler'], openingTime:'08:00', closingTime:'21:00',
      isOpen:true, isActive:true, isPhoneVerified:true, kycStatus:'approved',
      rating:4.5, deliveryRadius:8, minOrderAmount:100, avgDeliveryTime:30, commissionRate:10,
    },
    {
      shopName:'Best Chicken Center', ownerName:'Best Chicken Center Owner', phone:'9380005747',
      address:'Best Chicken Center, Bangalore', city:'Bangalore', pincode:'560022',
      location:{ type:'Point', coordinates:[77.5601104, 13.0074599] },
      categories:['broiler'], openingTime:'08:00', closingTime:'21:00',
      isOpen:true, isActive:true, isPhoneVerified:true, kycStatus:'approved',
      rating:4.3, deliveryRadius:8, minOrderAmount:100, avgDeliveryTime:30, commissionRate:10,
    },
    {
      shopName:"Leon's Burgers & Wings Rajajinagar", ownerName:"Leon's Owner", phone:'9380005748',
      address:"Leon's Burgers & Wings, Rajajinagar, Bangalore", city:'Bangalore', pincode:'560010',
      location:{ type:'Point', coordinates:[77.5478318, 12.9973307] },
      categories:['broiler'], openingTime:'08:00', closingTime:'21:00',
      isOpen:true, isActive:true, isPhoneVerified:true, kycStatus:'approved',
      rating:4.1, deliveryRadius:8, minOrderAmount:100, avgDeliveryTime:30, commissionRate:10,
    },
  ];
  try {
    const results = [];
    for (const s of TEST_SHOPS) {
      let existing = await Shop.findOne({ phone: s.phone });
      if (existing) {
        Object.assign(existing, s);
        await existing.save();
        results.push({ shop: s.shopName, action: 'updated' });
      } else {
        await new Shop(s).save();   // pre-save hook generates shopId
        results.push({ shop: s.shopName, action: 'inserted' });
      }
    }
    const allShops = await Shop.find({ isActive:true }).select('shopName location deliveryRadius isOpen phone shopId');
    res.json({ success:true, results, shops: allShops });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// ── Dev endpoint — clear all orders (test reset) ─────────────────────────────
app.get('/api/dev/clear-orders', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  try {
    const Order = require('./models/Order');
    const result = await Order.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount, message: 'All orders cleared ✅' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Dev seed endpoint — products ──────────────────────────────────────────────
app.get('/api/dev/seed-products', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  const Product = require('./models/Product');
  const Shop    = require('./models/Shop');

  // Load all active shops so products cover all shops dynamically
  const shops = await Shop.find({ isActive: true }).select('_id shopName');

  const PRODUCT_TEMPLATES = [
    { name:'Desi Country Chicken (Full)',     description:'Fresh pure desi country chicken, whole bird cleaned & dressed.',         category:'country',     price:680, originalPrice:720, unit:'kg',    minQuantity:0.5, isHit:true,  preparationTime:20 },
    { name:'Desi Country Chicken (Half)',     description:'Half bird, freshly cut. Best for small families.',                      category:'country',     price:360, originalPrice:380, unit:'500g', minQuantity:1,   isHit:false, preparationTime:15 },
    { name:'Broiler Chicken (Full)',          description:'Farm-fresh broiler chicken, hygienically cleaned.',                     category:'broiler',     price:220, originalPrice:240, unit:'kg',    minQuantity:0.5, isHit:true,  preparationTime:15 },
    { name:'Broiler Chicken (Curry Cut)',     description:'Pre-cut into curry pieces. Ready to marinate and cook.',                category:'curry-cut',   price:240, originalPrice:260, unit:'kg',    minQuantity:0.5, isHit:false, preparationTime:10 },
    { name:'Boneless Chicken',               description:'100% boneless chicken breast & thigh pieces.',                          category:'boneless',    price:320, originalPrice:350, unit:'kg',    minQuantity:0.5, isHit:false, preparationTime:20 },
    { name:'Chicken Wings',                  description:'Crispy wings, perfect for grilling or frying.',                         category:'wings',       price:280, originalPrice:300, unit:'kg',    minQuantity:0.5, isHit:false, preparationTime:10 },
    { name:'Chicken Liver',                  description:'Fresh chicken liver, rich in iron and protein.',                        category:'liver',       price:180, originalPrice:200, unit:'500g', minQuantity:1,   isHit:false, preparationTime:10 },
    { name:'Marinated Chicken (Tandoor)',    description:'24-hour marinated in tandoori spices. Grill-ready.',                    category:'marinated',   price:380, originalPrice:400, unit:'kg',    minQuantity:0.5, isHit:true,  preparationTime:5  },
    { name:'Country Chicken Eggs (Dozen)',   description:'Farm-fresh desi country chicken eggs, brown shell, rich yolk.',         category:'eggs',        price:120, originalPrice:130, unit:'dozen', minQuantity:1,   isHit:false, preparationTime:2  },
    { name:'Country Chicken Eggs (Half Doz)',description:'Half dozen fresh desi eggs.',                                           category:'eggs',        price:65,  originalPrice:70,  unit:'piece', minQuantity:1,   isHit:false, preparationTime:2  },
  ];

  try {
    // Drop any stale legacy indexes that may block insertion
    try {
      await require('mongoose').connection.collection('products').dropIndex('id_1');
      console.log('Dropped stale id_1 index from products');
    } catch {}

    const results = [];
    for (const shop of shops) {
      for (const tmpl of PRODUCT_TEMPLATES) {
        const existing = await Product.findOne({ shopId: shop._id, name: tmpl.name });
        if (!existing) {
          await Product.create({ shopId: shop._id, ...tmpl });
          results.push({ shop: shop.shopName, product: tmpl.name, action: 'inserted' });
        } else {
          results.push({ shop: shop.shopName, product: tmpl.name, action: 'exists' });
        }
      }
    }
    const count = await Product.countDocuments({ isAvailable: true });
    res.json({ success: true, results, totalProducts: count });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Static files — only serve if running locally (directories won't exist on Railway)
const fs = require('fs');
const adminDir   = path.join(__dirname, '..', 'admin');
const partnerDir = path.join(__dirname, '..', 'partner');
const customerDir = path.join(__dirname, '..', 'customer');
if (fs.existsSync(adminDir))   app.use('/admin',   express.static(adminDir));
if (fs.existsSync(partnerDir)) app.use('/partner', express.static(partnerDir));
if (fs.existsSync(customerDir)) app.use(express.static(customerDir));

app.get('*', (req, res) => {
  const indexFile = path.join(customerDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.json({ status: 'Fresh Live Chicken API', version: '1.0.0' });
  }
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Customer joins order tracking room
  socket.on('join:order', (orderId) => {
    socket.join(`order:${orderId}`);
    console.log(`Customer joined order:${orderId}`);
  });

  // Shop joins its own room
  socket.on('join:shop', (shopId) => {
    socket.join(`shop:${shopId}`);
    console.log(`Shop joined shop:${shopId}`);
  });

  // Delivery agent joins its room
  socket.on('join:delivery', (agentId) => {
    socket.join(`delivery:${agentId}`);
    console.log(`Delivery joined delivery:${agentId}`);
  });

  // Delivery agent broadcasts live GPS location
  socket.on('delivery:location', ({ orderId, lat, lng }) => {
    io.to(`order:${orderId}`).emit('delivery:location', { lat, lng });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready`);
});
