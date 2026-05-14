const path = require('path');
const { createDb } = require('./src/data/db');

createDb(path.join(__dirname, 'db.json'));
console.log('Database db.json berhasil dibuat.');
