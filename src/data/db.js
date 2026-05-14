const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const { DEFAULT_DATA } = require('../config/constants');
const { normalizeCategoryRecord } = require('../services/categoryService');
const { inferTransactionFlow } = require('../services/transactionService');
const { normalizeUserRecord } = require('../services/userService');
const { parseId } = require('../utils/common');

function initializeDb(db) {
  db.defaults(DEFAULT_DATA).write();

  const normalizedUsers = (db.get('users').value() || [])
    .map(normalizeUserRecord)
    .filter((user) => user.email && user.password_hash);
  db.set('users', normalizedUsers).write();

  const normalizedCategories = (db.get('categories').value() || []).map(normalizeCategoryRecord);
  db.set('categories', normalizedCategories).write();
  const categoryById = new Map(normalizedCategories.map((category) => [category.id, category]));

  const normalizedBudgets = (db.get('budgets').value() || []).map((budget, index) => ({
    ...budget,
    id: parseId(budget.id) ?? Date.now() + index,
    category_id: parseId(budget.category_id),
    amount: Number(budget.amount) || 0
  }));
  db.set('budgets', normalizedBudgets).write();

  const normalizedTransactions = (db.get('transactions').value() || []).map((transaction, index) => ({
    ...transaction,
    id: parseId(transaction.id) ?? Date.now() + index,
    category_id: parseId(transaction.category_id),
    amount: Number(transaction.amount) || 0,
    flow: inferTransactionFlow(transaction, categoryById.get(parseId(transaction.category_id)))
  }));
  db.set('transactions', normalizedTransactions).write();
}

function createDb(dbFile = path.join(__dirname, '..', '..', 'db.json')) {
  const adapter = new FileSync(dbFile);
  const db = low(adapter);
  initializeDb(db);
  return db;
}

module.exports = {
  createDb,
  initializeDb
};
