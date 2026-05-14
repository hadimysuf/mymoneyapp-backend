const { CATEGORY_TYPES, INCOME_GROUPS } = require('../config/constants');
const { inferIncomeGroup } = require('./incomeService');
const { normalizeString, parseId } = require('../utils/common');

function normalizeCategoryRecord(category) {
  const normalized = {
    ...category,
    id: parseId(category.id) ?? Date.now(),
    name: typeof category.name === 'string' ? category.name : '',
    type: category.type
  };

  if (normalized.type === 'income') {
    normalized.group = INCOME_GROUPS.has(category.group)
      ? category.group
      : inferIncomeGroup(normalized.name);
  } else {
    delete normalized.group;
  }

  return normalized;
}

function getCategoryById(db, categoryId) {
  return db.get('categories').find({ id: categoryId }).value() || null;
}

function buildCategoryPayload(body) {
  const name = normalizeString(body?.name);
  const type = normalizeString(body?.type);

  if (!name) {
    return { error: 'Category name is required.' };
  }

  if (!CATEGORY_TYPES.has(type)) {
    return { error: 'Category type must be income, expense, or savings.' };
  }

  const payload = {
    id: Date.now(),
    name,
    type
  };

  if (type === 'income') {
    const requestedGroup = normalizeString(body?.group);
    payload.group = INCOME_GROUPS.has(requestedGroup)
      ? requestedGroup
      : inferIncomeGroup(name);
  }

  return { value: payload };
}

function hasDuplicateCategoryName(db, payload) {
  return (db.get('categories').value() || []).some(
    (category) =>
      category.type === payload.type &&
      normalizeString(category.name).toLowerCase() === payload.name.toLowerCase()
  );
}

function isCategoryReferenced(db, categoryId) {
  const isUsedInTransactions = (db.get('transactions').value() || []).some(
    (transaction) => transaction.category_id === categoryId
  );
  const isUsedInBudgets = (db.get('budgets').value() || []).some(
    (budget) => budget.category_id === categoryId
  );

  return isUsedInTransactions || isUsedInBudgets;
}

module.exports = {
  buildCategoryPayload,
  getCategoryById,
  hasDuplicateCategoryName,
  isCategoryReferenced,
  normalizeCategoryRecord
};
