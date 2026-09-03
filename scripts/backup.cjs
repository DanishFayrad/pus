/**
 * MongoDB Backup Script
 * Usage:
 *   node scripts/backup.cjs
 *   node scripts/backup.cjs --uri="mongodb+srv://..." --db="salespoint"
 */

const { MongoClient, BSON } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Read args or fallback
const args = process.argv.slice(2);
let uri = 'mongodb+srv://danishfaryad55_db_user:A6Wnhqk1lXS8f6J0@cluster0.fq2jczs.mongodb.net/?appName=Cluster0';
let dbName = 'salespoint';

for (const arg of args) {
  if (arg.startsWith('--uri=')) uri = arg.replace('--uri=', '');
  if (arg.startsWith('--db=')) dbName = arg.replace('--db=', '');
}

// Format timestamp: YYYY-MM-DD_HH-mm-ss
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(__dirname, '..', 'backups', `backup-${dbName}-${timestamp}`);

async function runBackup() {
  console.log(`\n========================================`);
  console.log(`🚀 Starting MongoDB Backup`);
  console.log(`📦 Database: ${dbName}`);
  console.log(`📂 Destination: ${backupDir}`);
  console.log(`========================================\n`);

  fs.mkdirSync(backupDir, { recursive: true });

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`✅ Connected successfully to MongoDB.\n`);

    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log(`⚠️ No collections found in database "${dbName}".`);
      return;
    }

    const summary = [];

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      process.stdout.write(`⏳ Backing up [${colName}]... `);
      const collection = db.collection(colName);
      const docs = await collection.find({}).toArray();

      const filePath = path.join(backupDir, `${colName}.json`);
      fs.writeFileSync(filePath, BSON.EJSON.stringify(docs, null, 2), 'utf-8');

      console.log(`✔ ${docs.length} documents saved -> ${colName}.json`);
      summary.push({ collection: colName, count: docs.length, file: `${colName}.json` });
    }

    const meta = {
      database: dbName,
      createdAt: now.toISOString(),
      collections: summary,
    };
    fs.writeFileSync(path.join(backupDir, 'metadata.json'), JSON.stringify(meta, null, 2), 'utf-8');

    console.log(`\n========================================`);
    console.log(`🎉 Backup completed successfully!`);
    console.log(`📁 Files saved in: ${backupDir}`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error(`\n❌ Backup failed:`, err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runBackup();
