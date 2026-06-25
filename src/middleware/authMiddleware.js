const { jsonError } = require('../utils/common');
const { verifyAuthToken } = require('../utils/token');

function createAuthMiddleware() {
  return (req, res, next) => {
    const authHeader = req.get('authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return jsonError(res, 401, 'Unauthorized.');
    }

    try {
      const payload = verifyAuthToken(token);
      req.userId = Number.parseInt(payload.sub, 10);
      return next();
    } catch {
      return jsonError(res, 401, 'Unauthorized.');
    }
  };
}

module.exports = {
  createAuthMiddleware
};
