'use strict';

const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');
const userService = require('../services/user.service');

/**
 * Requires a valid `Authorization: Bearer <accessToken>` header.
 * On success `req.user` holds the fresh database row (without the password hash).
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token, so deactivating or deleting an account takes effect at once
 * instead of when the token happens to expire.
 */
function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing Bearer token'));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return next(err);
  }

  const user = userService.findById(payload.sub);
  if (!user) return next(ApiError.unauthorized('Account no longer exists'));
  if (!user.isActive) return next(ApiError.forbidden('Account is deactivated'));

  req.user = user;
  return next();
}

module.exports = authenticate;
