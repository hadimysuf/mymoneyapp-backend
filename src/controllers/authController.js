const crypto = require('crypto');
const { buildAuthPayload, validateLoginCredentials, validateRegisterPayload } = require('../services/userService');
const { jsonError } = require('../utils/common');

function createAuthController({ db, sessions }) {
  const createSessionToken = (userId) => {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, userId);
    return token;
  };

  return {
    register(req, res) {
      const result = validateRegisterPayload(db, req.body);
      if (result.error) {
        return jsonError(res, 400, result.error);
      }

      db.get('users').push(result.value).write();
      return res.status(201).json(buildAuthPayload(result.value, createSessionToken(result.value.id)));
    },

    login(req, res) {
      const result = validateLoginCredentials(db, req.body);
      if (result.error) {
        return jsonError(res, 401, result.error);
      }

      return res.json(buildAuthPayload(result.value, createSessionToken(result.value.id)));
    }
  };
}

module.exports = {
  createAuthController
};
