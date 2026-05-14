const { validateBudgetPayload } = require('../services/budgetService');
const { getCurrentMonth, jsonError, parseId } = require('../utils/common');

function createBudgetsController({ db }) {
  return {
    list(req, res) {
      return res.json(db.get('budgets').value() || []);
    },

    create(req, res) {
      const result = validateBudgetPayload(db, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      const existingBudget = db
        .get('budgets')
        .find({ category_id: result.value.categoryId, month: result.value.currentMonth })
        .value();

      if (existingBudget) {
        db.get('budgets')
          .find({ category_id: result.value.categoryId, month: result.value.currentMonth })
          .assign({
            id: existingBudget.id || result.value.timestamp,
            amount: result.value.amount,
            timestamp: result.value.timestamp,
            date: result.value.date
          })
          .write();
      } else {
        db.get('budgets')
          .push({
            id: result.value.timestamp,
            category_id: result.value.categoryId,
            amount: result.value.amount,
            month: result.value.currentMonth,
            timestamp: result.value.timestamp,
            date: result.value.date
          })
          .write();
      }

      return res.json({ message: 'Budget set for this month' });
    },

    remove(req, res) {
      const categoryId = parseId(req.params.id);
      if (categoryId === null) {
        return jsonError(res, 400, 'Budget category id is invalid.');
      }

      const currentMonth = getCurrentMonth();
      const existingBudget = db.get('budgets').find({ category_id: categoryId, month: currentMonth }).value();
      if (!existingBudget) {
        return jsonError(res, 404, 'Budget for the current month was not found.');
      }

      db.get('budgets').remove({ category_id: categoryId, month: currentMonth }).write();
      return res.json({ message: 'Budget deleted for this month' });
    }
  };
}

module.exports = {
  createBudgetsController
};
