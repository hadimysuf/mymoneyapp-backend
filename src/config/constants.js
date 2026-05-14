const CATEGORY_TYPES = new Set(['income', 'expense', 'savings']);
const INCOME_GROUPS = new Set(['salary', 'other']);
const SAVINGS_OUTFLOW_KEYWORDS = /\b(tarik|narik|ambil|withdraw|keluar|pakai|gunakan)\b/i;

const DEFAULT_DATA = {
  users: [],
  transactions: [],
  categories: [
    { id: 1, name: 'Gaji', type: 'income', group: 'salary' },
    { id: 2, name: 'Bonus/Freelance', type: 'income', group: 'other' },
    { id: 3, name: 'Makanan', type: 'expense' },
    { id: 4, name: 'Tabungan Masa Depan', type: 'savings' }
  ],
  budgets: []
};

module.exports = {
  CATEGORY_TYPES,
  DEFAULT_DATA,
  INCOME_GROUPS,
  SAVINGS_OUTFLOW_KEYWORDS
};
