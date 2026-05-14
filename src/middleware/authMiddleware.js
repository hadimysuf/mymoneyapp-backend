const { jsonError } = require('../utils/common');

function createAuthMiddleware({ sessions }) {
  return (req, res, next) => {
    const authHeader = req.get('authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token || !sessions.has(token)) {
      return jsonError(res, 401, 'Unauthorized.');
    }

    req.userId = sessions.get(token);
    return next();
  };
}

module.exports = {
  createAuthMiddleware
};
