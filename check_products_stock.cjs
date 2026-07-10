const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#\s=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1]] = val;
  }
});

async function run() {
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB || 'salespoint'
  });

  const Product = mongoose.connection.model('Product', new mongoose.Schema({}, { strict: false }), 'products');
  const products = await Product.find().lean();
  
  console.log("=== Database Product Stocks ===");
  let calculatedInventoryValue = 0;
  products.forEach(p => {
    const itemValue = p.cost * p.stock;
    calculatedInventoryValue += itemValue;
    console.log(`Product: ${p.name} | Stock: ${p.stock} | Cost: Rs ${p.cost} | Value: Rs ${itemValue}`);
  });
  console.log(`\nTotal Calculated Inventory Value: Rs ${calculatedInventoryValue.toLocaleString()}`);

  await mongoose.connection.close();
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
