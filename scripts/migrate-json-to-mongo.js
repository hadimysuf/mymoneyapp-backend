require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { createMongoDb } = require('../src/data/db');

async function migrate() {
  const sourcePath = process.env.DB_JSON_PATH
    ? path.resolve(process.env.DB_JSON_PATH)
    : path.join(__dirname, '..', 'db.json');

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const rawContent = fs.readFileSync(sourcePath, 'utf8');
  const parsedData = JSON.parse(rawContent);

  const db = await createMongoDb();

  try {
    await db.syncSeedData(parsedData);
    console.log(`Migration completed from ${sourcePath}.`);
  } finally {
    await db.close();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
