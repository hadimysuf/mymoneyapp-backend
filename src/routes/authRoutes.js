const express = require('express');

function createAuthRouter(controller) {
  const router = express.Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);

  return router;
}

module.exports = {
  createAuthRouter
};
