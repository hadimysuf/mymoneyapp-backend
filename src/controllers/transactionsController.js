const { validateTransactionPayload } = require('../services/transactionService');
const { jsonError, parseId } = require('../utils/common');

function createTransactionsController({ db }) {
  return {
    list(req, res) {
      return res.json(db.get('transactions').value());
    },

    create(req, res) {
      const result = validateTransactionPayload(db, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      db.get('transactions').push(result.value).write();
      return res.status(201).json(result.value);
    },

    update(req, res) {
      const transactionId = parseId(req.params.id);
      if (transactionId === null) {
        return jsonError(res, 400, 'Transaction id is invalid.');
      }

      const existingTransaction = db.get('transactions').find({ id: transactionId }).value();
      if (!existingTransaction) {
        return jsonError(res, 404, 'Transaction not found.');
      }

      const result = validateTransactionPayload(db, req.body, { existingTransaction });
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      db.get('transactions')
        .find({ id: transactionId })
        .assign({
          ...result.value,
          id: transactionId
        })
        .write();

      return res.json(db.get('transactions').find({ id: transactionId }).value());
    },

    remove(req, res) {
      const transactionId = parseId(req.params.id);
      if (transactionId === null) {
        return jsonError(res, 400, 'Transaction id is invalid.');
      }

      const existing = db.get('transactions').find({ id: transactionId }).value();
      if (!existing) {
        return jsonError(res, 404, 'Transaction not found.');
      }

      db.get('transactions').remove({ id: transactionId }).write();
      return res.json({ message: 'Deleted' });
    }
  };
}

module.exports = {
  createTransactionsController
};
