const { createErrorResponse } = require('../../protocol/types');
const { ErrorCodes } = require('../../protocol/errors');

/**
 * Middleware xác thực Bearer Token.
 *
 * - Nếu SECRET_TOKEN rỗng (chưa set) → skip auth (dev mode)
 * - Nếu có SECRET_TOKEN → kiểm tra header Authorization: Bearer <token>
 *
 * @param {object} config - App config từ loadConfig()
 * @returns {Function} Express middleware
 */
function authMiddleware(config) {
  return (req, res, next) => {
    const secret = config.server.secretToken;

    // Dev mode: không set SECRET_TOKEN → cho qua
    if (!secret) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(
        createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Thiếu Authorization header')
      );
    }

    const token = authHeader.slice(7); // cắt "Bearer "
    if (token !== secret) {
      return res.status(401).json(
        createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Token không hợp lệ')
      );
    }

    next();
  };
}

module.exports = authMiddleware;
