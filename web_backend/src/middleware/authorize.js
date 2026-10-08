'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Role check. Must be used after `authenticate`.
 *
 *   router.delete('/:id', authenticate, authorize('admin'), controller.remove);
 *
 * Roles in this system:
 *   admin      - everything, including user management
 *   dispatcher - create and update hospitals, vehicles, incidents, missions
 *   viewer     - read only
 */
function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${allowedRoles.join(' or ')}`));
    }
    return next();
  };
}

module.exports = authorize;
