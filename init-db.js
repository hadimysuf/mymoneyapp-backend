require('dotenv').config();

const { createMongoDb } = require('./src/data/db');

async function initializeDatabase() {
  const db = await createMongoDb();
  await db.close();
  console.log('MongoDB connection and indexes initialized successfully.');
}

initializeDatabase().catch((error) => {
  console.error('Failed to initialize MongoDB:', error);
  process.exit(1);
});
