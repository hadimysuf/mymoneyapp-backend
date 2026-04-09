const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);

// Set data default
db.defaults({ 
  transactions: [], 
  categories: [
    { id: 1, name: "Gaji", type: "income" },
    { id: 2, name: "Makanan", type: "expense" },
    { id: 3, name: "Transportasi", type: "expense" },
    { id: 4, name: "Hiburan", type: "expense" }
  ],
  budgets: [] 
}).write();

console.log("✅ Database db.json berhasil dibuat!");