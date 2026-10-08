'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('./ApiError');

/**
 * Two kinds of token:
 *   access  - a short-lived signed JWT sent as `Authorization: Bearer <token>`
 *   refresh - a long-lived random string; only its SHA-256 hash is stored, so a
 *             leaked database still cannot be used to log in
 */

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl },
  );
}

/** Returns the decoded payload, or throws a 401 ApiError. */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token expired');
    }
    throw ApiError.unauthorized('Invalid access token');
  }
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshTokenExpiry() {
  const ms = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
};
