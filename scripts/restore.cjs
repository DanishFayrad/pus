/**
 * MongoDB Restore Script
 * Usage:
 *   node scripts/restore.cjs
 *   node scripts/restore.cjs --dir="backups/backup-salespoint-..."
 *   node scripts/restore.cjs --dir="backups/backup-salespoint-..." --uri="mongodb://localhost:27017" --db="salespoint"
 */

const { MongoClient, BSON } = require('mongodb');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let uri = 'mongodb+srv://danishfaryad55_db_user:A6Wnhqk1lXS8f6J0@cluster0.fq2jczs.mongodb.net/?appName=Cluster0';
let dbName = 'salespoint';
let targetDir = '';

for (const arg of args) {
  if (arg.startsWith('--uri=')) uri = arg.replace('--uri=', '');
  if (arg.startsWith('--db=')) dbName = arg.replace('--db=', '');
  if (arg.startsWith('--dir=')) targetDir = arg.replace('--dir=', '');
}

// If no dir specified, find the latest backup
if (!targetDir) {
  const backupsRoot = path.join(__dirname, '..', 'backups');
  if (fs.existsSync(backupsRoot)) {
    const dirs = fs.readdirSync(backupsRoot)
      .map(d => path.join(backupsRoot, d))
      .filter(p => fs.statSync(p).isDirectory())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (dirs.length > 0) {
      targetDir = dirs[0];
    }
  }
}

if (!targetDir || !fs.existsSync(targetDir)) {
  console.error(`❌ Backup folder not found. Please specify with --dir="backups/..."`);
  process.exit(1);
}

async function runRestore() {
  console.log(`\n========================================`);
  console.log(`🚀 Starting MongoDB Restore`);
  console.log(`📦 Target Database: ${dbName}`);
  console.log(`📂 Source Directory: ${targetDir}`);
  console.log(`========================================\n`);

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`✅ Connected successfully to MongoDB.\n`);

    const db = client.db(dbName);
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.json') && f !== 'metadata.json');

    for (const file of files) {
      const colName = path.basename(file, '.json');
      const filePath = path.join(targetDir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const docs = BSON.EJSON.parse(raw);

      if (!Array.isArray(docs) || docs.length === 0) {
        console.log(`ℹ️ [${colName}]: 0 documents to restore.`);
        continue;
      }

      process.stdout.write(`⏳ Restoring [${colName}]... `);
      const collection = db.collection(colName);
      // Clean collection before restore
      await collection.deleteMany({});
      await collection.insertMany(docs);
      console.log(`✔ Restored ${docs.length} document(s).`);
    }

    console.log(`\n========================================`);
    console.log(`🎉 Restore completed successfully!`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error(`❌ Restore failed:`, err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

runRestore();
