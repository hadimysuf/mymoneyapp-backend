const { validateTransactionPayload } = require('../services/transactionService');
const { jsonError, parseId } = require('../utils/common');

function createTransactionsController({ db }) {
  return {
    async list(req, res) {
      return res.json(await db.listTransactions());
    },

    async create(req, res) {
      const result = await validateTransactionPayload(db, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      await db.createTransaction(result.value);
      return res.status(201).json(result.value);
    },

    async update(req, res) {
      const transactionId = parseId(req.params.id);
      if (transactionId === null) {
        return jsonError(res, 400, 'Transaction id is invalid.');
      }

      const existingTransaction = await db.findTransactionById(transactionId);
      if (!existingTransaction) {
        return jsonError(res, 404, 'Transaction not found.');
      }

      const result = await validateTransactionPayload(db, req.body, { existingTransaction });
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      const updatedTransaction = await db.updateTransaction(transactionId, {
        ...result.value,
        id: transactionId
      });

      return res.json(updatedTransaction);
    },

    async remove(req, res) {
      const transactionId = parseId(req.params.id);
      if (transactionId === null) {
        return jsonError(res, 400, 'Transaction id is invalid.');
      }

      const existing = await db.findTransactionById(transactionId);
      if (!existing) {
        return jsonError(res, 404, 'Transaction not found.');
      }

      await db.deleteTransaction(transactionId);
      return res.json({ message: 'Deleted' });
    }
  };
}

module.exports = {
  createTransactionsController
};
