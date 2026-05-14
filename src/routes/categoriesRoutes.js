const express = require('express');

function createCategoriesRouter(controller) {
  const router = express.Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.delete('/:id', controller.remove);

  return router;
}

module.exports = {
  createCategoriesRouter
};
