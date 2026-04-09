const express = require('express');
const cors = require('cors');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
app.use(cors());
app.use(express.json());

const adapter = new FileSync('db.json');
const db = low(adapter);

db.defaults({ 
  transactions: [], 
  categories: [
    { id: 1, name: "Gaji Utama", type: "income" },
    { id: 2, name: "Bonus/Freelance", type: "income" },
    { id: 3, name: "Makanan", type: "expense" },
    { id: 4, name: "Tabungan Masa Depan", type: "savings" }
  ],
  budgets: [] 
}).write();

// ==========================================
// 1. ENDPOINT TRANSAKSI
// ==========================================
app.get('/api/transactions', (req, res) => res.json(db.get('transactions').value()));
app.post('/api/transactions', (req, res) => {
    const dateObj = new Date();
    const newTransaction = { 
        id: Date.now(), 
        ...req.body, 
        amount: parseFloat(req.body.amount),
        category_id: parseInt(req.body.category_id),
        date: dateObj.toLocaleDateString('id-ID'),
        month: dateObj.toISOString().slice(0, 7), // Format "YYYY-MM"
        timestamp: dateObj.getTime()
    };
    db.get('transactions').push(newTransaction).write();
    res.status(201).json(newTransaction);
});
app.delete('/api/transactions/:id', (req, res) => {
    db.get('transactions').remove({ id: parseInt(req.params.id) }).write();
    res.json({ message: "Deleted" });
});

// ==========================================
// 2. ENDPOINT KATEGORI
// ==========================================
app.get('/api/categories', (req, res) => res.json(db.get('categories').value()));
app.post('/api/categories', (req, res) => {
    const newCategory = { id: Date.now(), ...req.body };
    db.get('categories').push(newCategory).write();
    res.status(201).json(newCategory);
});
app.delete('/api/categories/:id', (req, res) => {
    db.get('categories').remove({ id: parseInt(req.params.id) }).write();
    res.json({ message: "Deleted" });
});

// ==========================================
// 3. ENDPOINT ALOKASI ANGGARAN (HISTORY MODE)
// ==========================================
app.get('/api/budgets', (req, res) => {
    // Kirimkan semua data budget (termasuk bulan lalu) agar Frontend bisa membuat Riwayat
    res.json(db.get('budgets').value() || []);
});

app.post('/api/budgets', (req, res) => {
    const { category_id, amount } = req.body;
    const dateObj = new Date();
    const currentMonth = dateObj.toISOString().slice(0, 7);
    const timestamp = dateObj.getTime();
    const dateStr = dateObj.toLocaleDateString('id-ID');

    if (!db.has('budgets').value()) db.set('budgets', []).write();
    
    // Cek apakah sudah ada data alokasi di BULAN INI
    const exists = db.get('budgets').find({ category_id: parseInt(category_id), month: currentMonth }).value();
    
    if (exists) {
        db.get('budgets')
          .find({ category_id: parseInt(category_id), month: currentMonth })
          .assign({ amount: parseFloat(amount), timestamp, date: dateStr })
          .write();
    } else {
        db.get('budgets')
          .push({ category_id: parseInt(category_id), amount: parseFloat(amount), month: currentMonth, timestamp, date: dateStr })
          .write();
    }
    res.json({ message: "Budget set for this month" });
});

app.delete('/api/budgets/:id', (req, res) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    // Hanya hapus alokasi bulan ini, agar history bulan lalu aman
    db.get('budgets').remove({ category_id: parseInt(req.params.id), month: currentMonth }).write();
    res.json({ message: "Budget deleted for this month" });
});

// ==========================================
// 4. SUMMARY (LOGIKA TUTUP BUKU & DOMPET FISIK)
// ==========================================
app.get('/api/summary', (req, res) => {
    const tx = db.get('transactions').value() || [];
    const buds = db.get('budgets').value() || [];
    const cats = db.get('categories').value() || [];

    const currentMonth = new Date().toISOString().slice(0, 7); 
    const todayDate = new Date().getDate(); 

    // Filter Data per Bulan
    const txThisMonth = tx.filter(t => t.month === currentMonth);
    const txPastMonths = tx.filter(t => t.month < currentMonth);
    const budsThisMonth = buds.filter(b => b.month === currentMonth);
    const budsPastMonths = buds.filter(b => b.month < currentMonth);

    // Filter Khusus Tabungan
    const savings_cats = cats.filter(c => c.type === 'savings').map(c => c.id);

    // --- HITUNGAN BULAN INI ---
    const income_salary = txThisMonth.filter(t => t.type === 'income' && t.description.toLowerCase().includes('gaji')).reduce((a, b) => a + b.amount, 0);
    const income_other = txThisMonth.filter(t => t.type === 'income' && !t.description.toLowerCase().includes('gaji')).reduce((a, b) => a + b.amount, 0);
    const total_income_this_month = income_salary + income_other;

    const total_allocated_this_month = budsThisMonth.reduce((a, b) => a + b.amount, 0);
    const unallocated_this_month = total_income_this_month - total_allocated_this_month;

    const expense_this_month = txThisMonth.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const active_balance = total_income_this_month - total_allocated_this_month - expense_this_month;

    // --- SISA BULAN KEMARIN (ROLLOVER AKUNTANSI FISIK) ---
    const total_income_past = txPastMonths.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const total_expense_past = txPastMonths.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    
    // Total alokasi masa lalu
    const total_allocated_past = budsPastMonths.reduce((a, b) => a + b.amount, 0);
    const savings_allocated_past = budsPastMonths.filter(b => savings_cats.includes(b.category_id)).reduce((a, b) => a + b.amount, 0);
    const expense_allocated_past = total_allocated_past - savings_allocated_past;

    // 1. Uang yang LUPA di-manage (Pendapatan - Alokasi)
    const unallocated_past = total_income_past - total_allocated_past;

    // 2. Uang yang SUDAH di-manage untuk belanja, tapi TIDAK HABIS dipakai
    const unspent_past = expense_allocated_past - total_expense_past;

    // Total Sisa Uang Fisik (Gabungan)
    const leftover_past_month = unallocated_past + unspent_past; 
    
    let leftover_percentage = 0;
    if (total_income_past > 0) {
        leftover_percentage = ((leftover_past_month / total_income_past) * 100).toFixed(1);
    }

    // --- TABUNGAN GLOBAL (TIDAK PERNAH RESET) ---
    const all_savings_allocated = buds.filter(b => savings_cats.includes(b.category_id)).reduce((a, b) => a + b.amount, 0);
    const total_savings_spent = tx.filter(t => t.type === 'savings').reduce((a, b) => a + b.amount, 0);
    const savings_balance = all_savings_allocated - total_savings_spent;

    res.json({ 
        current_month: currentMonth,
        is_end_of_month: todayDate >= 25, 
        income_salary,
        income_other,
        total_income_this_month, 
        unallocated_this_month,
        active_balance,
        leftover_past_month,
        leftover_percentage,
        unallocated_past,
        unspent_past,
        savings_balance
    });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 Backend Finansial Master SIAP di http://localhost:${PORT}`));