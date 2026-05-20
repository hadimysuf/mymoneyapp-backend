const { MongoClient } = require('mongodb');

const { DEFAULT_DATA } = require('../config/constants');
const { normalizeCategoryRecord } = require('../services/categoryService');
const { inferTransactionFlow } = require('../services/transactionService');
const { normalizeUserRecord } = require('../services/userService');
const { parseId } = require('../utils/common');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripMongoId(document) {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  return rest;
}

function createDocumentMatcher(query = {}) {
  return (document) =>
    Object.entries(query).every(([key, value]) => document[key] === value);
}

function normalizeBudgetRecord(budget, index) {
  return {
    ...budget,
    id: parseId(budget.id) ?? Date.now() + index,
    category_id: parseId(budget.category_id),
    amount: Number(budget.amount) || 0
  };
}

function normalizeTransactionRecord(transaction, index, categoryById) {
  const categoryId = parseId(transaction.category_id);
  return {
    ...transaction,
    id: parseId(transaction.id) ?? Date.now() + index,
    category_id: categoryId,
    amount: Number(transaction.amount) || 0,
    flow: inferTransactionFlow(transaction, categoryById.get(categoryId))
  };
}

function prepareSeedData(seedData = {}) {
  const baseData = {
    users: Array.isArray(seedData.users) ? seedData.users : DEFAULT_DATA.users,
    transactions: Array.isArray(seedData.transactions) ? seedData.transactions : DEFAULT_DATA.transactions,
    categories: Array.isArray(seedData.categories) ? seedData.categories : DEFAULT_DATA.categories,
    budgets: Array.isArray(seedData.budgets) ? seedData.budgets : DEFAULT_DATA.budgets
  };

  const normalizedUsers = baseData.users
    .map(normalizeUserRecord)
    .filter((user) => user.email && user.password_hash);

  const normalizedCategories = baseData.categories.map(normalizeCategoryRecord);
  const categoryById = new Map(normalizedCategories.map((category) => [category.id, category]));

  const normalizedBudgets = baseData.budgets.map(normalizeBudgetRecord);
  const normalizedTransactions = baseData.transactions.map((transaction, index) =>
    normalizeTransactionRecord(transaction, index, categoryById)
  );

  return {
    users: normalizedUsers,
    categories: normalizedCategories,
    budgets: normalizedBudgets,
    transactions: normalizedTransactions
  };
}

function createMemoryDb(seedData = {}) {
  const state = prepareSeedData(seedData);

  const getCollectionState = (collectionName) => {
    if (!Object.prototype.hasOwnProperty.call(state, collectionName)) {
      throw new Error(`Unknown collection: ${collectionName}`);
    }

    return state[collectionName];
  };

  return {
    async getCollection(collectionName) {
      return clone(getCollectionState(collectionName));
    },

    async findOne(collectionName, query) {
      const collection = getCollectionState(collectionName);
      const matcher = createDocumentMatcher(query);
      const document = collection.find(matcher);
      return document ? clone(document) : null;
    },

    async listUsers() {
      return this.getCollection('users');
    },

    async findUserByEmail(email) {
      return this.findOne('users', { email });
    },

    async createUser(user) {
      state.users.push(clone(user));
      return clone(user);
    },

    async listCategories() {
      return this.getCollection('categories');
    },

    async findCategoryById(categoryId) {
      return this.findOne('categories', { id: categoryId });
    },

    async createCategory(category) {
      state.categories.push(clone(category));
      return clone(category);
    },

    async deleteCategoryById(categoryId) {
      const initialLength = state.categories.length;
      state.categories = state.categories.filter((category) => category.id !== categoryId);
      return state.categories.length !== initialLength;
    },

    async listBudgets() {
      return this.getCollection('budgets');
    },

    async findBudgetByCategoryAndMonth(categoryId, month) {
      return this.findOne('budgets', { category_id: categoryId, month });
    },

    async upsertBudget(budget) {
      const existingIndex = state.budgets.findIndex(
        (item) => item.category_id === budget.category_id && item.month === budget.month
      );

      if (existingIndex >= 0) {
        state.budgets[existingIndex] = { ...state.budgets[existingIndex], ...clone(budget) };
        return clone(state.budgets[existingIndex]);
      }

      state.budgets.push(clone(budget));
      return clone(budget);
    },

    async deleteBudget(categoryId, month) {
      const initialLength = state.budgets.length;
      state.budgets = state.budgets.filter(
        (budget) => !(budget.category_id === categoryId && budget.month === month)
      );
      return state.budgets.length !== initialLength;
    },

    async listTransactions() {
      return this.getCollection('transactions');
    },

    async findTransactionById(transactionId) {
      return this.findOne('transactions', { id: transactionId });
    },

    async createTransaction(transaction) {
      state.transactions.push(clone(transaction));
      return clone(transaction);
    },

    async updateTransaction(transactionId, updates) {
      const existingIndex = state.transactions.findIndex((transaction) => transaction.id === transactionId);
      if (existingIndex < 0) {
        return null;
      }

      state.transactions[existingIndex] = { ...state.transactions[existingIndex], ...clone(updates) };
      return clone(state.transactions[existingIndex]);
    },

    async deleteTransaction(transactionId) {
      const initialLength = state.transactions.length;
      state.transactions = state.transactions.filter((transaction) => transaction.id !== transactionId);
      return state.transactions.length !== initialLength;
    },

    async syncSeedData(seedDataToSync) {
      const normalizedData = prepareSeedData(seedDataToSync);
      state.users = normalizedData.users;
      state.categories = normalizedData.categories;
      state.budgets = normalizedData.budgets;
      state.transactions = normalizedData.transactions;
    },

    async close() {}
  };
}

function resolveDbName(uri, explicitDbName) {
  if (explicitDbName) {
    return explicitDbName;
  }

  try {
    const parsedUri = new URL(uri);
    const pathname = parsedUri.pathname.replace(/^\/+/, '');
    return pathname || 'mymoneyapp';
  } catch {
    return 'mymoneyapp';
  }
}

async function ensureIndexes(database) {
  await Promise.all([
    database.collection('users').createIndex({ id: 1 }, { unique: true }),
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('categories').createIndex({ id: 1 }, { unique: true }),
    database.collection('transactions').createIndex({ id: 1 }, { unique: true }),
    database.collection('budgets').createIndex({ id: 1 }, { unique: true }),
    database.collection('budgets').createIndex({ category_id: 1, month: 1 }, { unique: true })
  ]);
}

async function ensureDefaultCategories(database) {
  const categoriesCollection = database.collection('categories');
  const existingCategories = await categoriesCollection.countDocuments();

  if (existingCategories > 0) {
    return;
  }

  const defaultCategories = prepareSeedData({ categories: DEFAULT_DATA.categories }).categories;
  if (defaultCategories.length > 0) {
    await categoriesCollection.insertMany(defaultCategories);
  }
}

async function upsertCollection(collection, documents, key = 'id') {
  if (!documents.length) {
    return;
  }

  await collection.bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { [key]: document[key] },
        replacement: document,
        upsert: true
      }
    }))
  );
}

async function createMongoDb({ mongoUri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB_NAME } = {}) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI belum di-set. Isi connection string MongoDB Atlas sebelum menjalankan backend.');
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  const database = client.db(resolveDbName(mongoUri, dbName));
  await ensureIndexes(database);
  await ensureDefaultCategories(database);

  return {
    async getCollection(collectionName) {
      return database.collection(collectionName).find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
    },

    async findOne(collectionName, query) {
      const document = await database.collection(collectionName).findOne(query, { projection: { _id: 0 } });
      return stripMongoId(document);
    },

    async listUsers() {
      return this.getCollection('users');
    },

    async findUserByEmail(email) {
      return this.findOne('users', { email });
    },

    async createUser(user) {
      await database.collection('users').insertOne(user);
      return clone(user);
    },

    async listCategories() {
      return this.getCollection('categories');
    },

    async findCategoryById(categoryId) {
      return this.findOne('categories', { id: categoryId });
    },

    async createCategory(category) {
      await database.collection('categories').insertOne(category);
      return clone(category);
    },

    async deleteCategoryById(categoryId) {
      const result = await database.collection('categories').deleteOne({ id: categoryId });
      return result.deletedCount > 0;
    },

    async listBudgets() {
      return this.getCollection('budgets');
    },

    async findBudgetByCategoryAndMonth(categoryId, month) {
      return this.findOne('budgets', { category_id: categoryId, month });
    },

    async upsertBudget(budget) {
      await database.collection('budgets').updateOne(
        { category_id: budget.category_id, month: budget.month },
        { $set: budget },
        { upsert: true }
      );

      return this.findBudgetByCategoryAndMonth(budget.category_id, budget.month);
    },

    async deleteBudget(categoryId, month) {
      const result = await database.collection('budgets').deleteOne({ category_id: categoryId, month });
      return result.deletedCount > 0;
    },

    async listTransactions() {
      return this.getCollection('transactions');
    },

    async findTransactionById(transactionId) {
      return this.findOne('transactions', { id: transactionId });
    },

    async createTransaction(transaction) {
      await database.collection('transactions').insertOne(transaction);
      return clone(transaction);
    },

    async updateTransaction(transactionId, updates) {
      const updatedTransaction = await database.collection('transactions').findOneAndUpdate(
        { id: transactionId },
        { $set: updates },
        { projection: { _id: 0 }, returnDocument: 'after' }
      );

      return stripMongoId(updatedTransaction);
    },

    async deleteTransaction(transactionId) {
      const result = await database.collection('transactions').deleteOne({ id: transactionId });
      return result.deletedCount > 0;
    },

    async syncSeedData(seedData) {
      const normalizedData = prepareSeedData(seedData);
      await Promise.all([
        upsertCollection(database.collection('users'), normalizedData.users),
        upsertCollection(database.collection('categories'), normalizedData.categories),
        upsertCollection(database.collection('budgets'), normalizedData.budgets),
        upsertCollection(database.collection('transactions'), normalizedData.transactions)
      ]);
    },

    async close() {
      await client.close();
    }
  };
}

module.exports = {
  createMemoryDb,
  createMongoDb,
  prepareSeedData
};
