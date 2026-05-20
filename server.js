require('dotenv').config();

const { createApp } = require('./app');

const PORT = process.env.PORT || 3001;

async function startServer() {
  const { app, db } = await createApp();
  const server = app.listen(PORT, () => console.log(`Backend Finansial siap di http://localhost:${PORT}`));

  const shutdown = async () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((error) => {
  console.error('Gagal menjalankan backend:', error);
  process.exit(1);
});
