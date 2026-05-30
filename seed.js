const mongoose = require('mongoose');
const Product = require('./models/Product');
require('dotenv').config();

const products = [
  { name: "Chicken Curry Cut - Small Pieces", weight: "500 g | 12-18 Pieces | Serves 4", price: 169, originalPrice: 201, discount: 16, image: "https://static.wixstatic.com/media/8bcb0b_8a7a98ece34a495b82faeef4105c11b5~mv2.png/v1/fit/w_500,h_500,q_90/file.png", category: "chicken", delivery: "Delivery in 30 mins", isHit: true },
  { name: "Loaded Chicken Wings", weight: "200 g | 8 Pieces", price: 169, originalPrice: 199, discount: 15, image: "https://thenightowlchef.com/wp-content/uploads/2025/02/how-to-cut-chicken-wings-featured.jpg", category: "chicken", delivery: "Delivery in 30 mins", isHit: true },
  { name: "Whole Pure Desi Chicken", weight: "1 kg | Whole | Serves 4-5", price: 350, originalPrice: 400, discount: 13, image: "https://m.media-amazon.com/images/I/61qQtYB0KRL._AC_UF894,1000_QL80_.jpg", category: "chicken", delivery: "Delivery in 35 mins", isHit: false },
  { name: "Whole Pure Desi Chicken", weight: "500 gram | Whole", price: 185, originalPrice: 220, discount: 16, image: "https://m.media-amazon.com/images/I/61qQtYB0KRL._AC_UF894,1000_QL80_.jpg", category: "chicken", delivery: "Delivery in 35 mins", isHit: true },
  { name: "Pure Desi Chicken Boneless", weight: "1 kg | Boneless Cubes | Serves 3-4", price: 380, originalPrice: 450, discount: 16, image: "https://www.bbassets.com/media/uploads/p/l/40048898_5-fresho-chicken-curry-cut-without-skin-antibiotic-residue-free.jpg", category: "chicken", delivery: "Delivery in 30 mins", isHit: false },
  { name: "Chicken Curry Cut (Raw)", weight: "1 kg | Full Curry Cut", price: 370, originalPrice: 430, discount: 14, image: "https://static.wixstatic.com/media/8bcb0b_8a7a98ece34a495b82faeef4105c11b5~mv2.png/v1/fit/w_500,h_500,q_90/file.png", category: "chicken", delivery: "Delivery in 25 mins", isHit: true },
  { name: "Chicken Spread - Tandoori", weight: "1 kg | Ready to Eat | Single Serve", price: 400, originalPrice: 450, discount: 11, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400&h=300&fit=crop", category: "spreads", delivery: "Delivery in 25 mins", isHit: false }
];

async function seedProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Product.deleteMany({});
    await Product.insertMany(products);
    console.log('✅ Products seeded successfully!');
    process.exit();
  } catch (error) {
    console.error('Error seeding products:', error);
    process.exit(1);
  }
}

seedProducts();
