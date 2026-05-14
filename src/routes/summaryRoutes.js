const express = require('express');

function createSummaryRouter(controller) {
  const router = express.Router();

  router.get('/summary', controller.show);

  return router;
}

module.exports = {
  createSummaryRouter
};
