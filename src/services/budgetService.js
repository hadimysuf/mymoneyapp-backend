const { getCategoryById } = require('./categoryService');
const { getCurrentMonth, formatLocalDate, parseId, parsePositiveAmount } = require('../utils/common');

function getCurrentMonthIncome(db, currentMonth) {
  return (db.get('transactions').value() || [])
    .filter((transaction) => transaction.month === currentMonth && transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function validateBudgetPayload(db, body) {
  const categoryId = parseId(body?.category_id);
  const amount = parsePositiveAmount(body?.amount);

  if (categoryId === null) {
    return { error: 'Budget category_id is invalid.' };
  }

  if (!amount) {
    return { error: 'Budget amount must be a positive number.' };
  }

  const category = getCategoryById(db, categoryId);
  if (!category) {
    return { error: 'Budget category does not exist.' };
  }

  if (!['expense', 'savings'].includes(category.type)) {
    return { error: 'Only expense or savings categories can be budgeted.' };
  }

  const now = new Date();
  const currentMonth = getCurrentMonth(now);
  const budgets = db.get('budgets').value() || [];
  const totalIncomeThisMonth = getCurrentMonthIncome(db, currentMonth);
  const currentMonthAllocatedExcludingTarget = budgets
    .filter((budget) => budget.month === currentMonth && budget.category_id !== categoryId)
    .reduce((sum, budget) => sum + budget.amount, 0);

  if (currentMonthAllocatedExcludingTarget + amount > totalIncomeThisMonth) {
    return {
      error: `Budget allocation exceeds current month income. Remaining allocatable amount is ${Math.max(totalIncomeThisMonth - currentMonthAllocatedExcludingTarget, 0)}.`
    };
  }

  return {
    value: {
      categoryId,
      amount,
      currentMonth,
      timestamp: now.getTime(),
      date: formatLocalDate(now)
    }
  };
}

module.exports = {
  getCurrentMonthIncome,
  validateBudgetPayload
};
