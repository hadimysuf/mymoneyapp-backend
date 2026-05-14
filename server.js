const path = require('path');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3001;
const { app } = createApp({ dbFile: path.join(__dirname, 'db.json') });

app.listen(PORT, () => console.log(`Backend Finansial siap di http://localhost:${PORT}`));
