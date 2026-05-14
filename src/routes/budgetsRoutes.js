const express = require('express');

function createBudgetsRouter(controller) {
  const router = express.Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.delete('/:id', controller.remove);

  return router;
}

module.exports = {
  createBudgetsRouter
};
