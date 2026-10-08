'use strict';

const { db } = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { newId, now, fromDbBool } = require('../utils/helpers');
const { verifyPassword, hashPassword } = require('../utils/password');
const userService = require('./user.service');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} = require('../utils/tokens');

/**
 * A real bcrypt hash of a throwaway string. When someone tries to log in with an
 * email that does not exist we still run one comparison against it, so a missing
 * account and a wrong password take the same amount of time.
 */
const DUMMY_HASH = hashPassword('packmen-dummy-password-for-timing');

/** Stores the hash of a fresh refresh token and returns the plain token. */
function issueRefreshToken(userId) {
  const token = generateRefreshToken();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(newId(), userId, hashRefreshToken(token), refreshTokenExpiry(), now());
  return token;
}

function buildSession(user) {
  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: issueRefreshToken(user.id),
  };
}

/**
 * Self-service sign-up. The very first account ever created becomes the admin,
 * so a fresh database is never locked out; everyone after that starts as a
 * viewer and an admin promotes them.
 */
function register({ name, email, password }) {
  const role = userService.count() === 0 ? 'admin' : 'viewer';
  const user = userService.create({ name, email, password, role, isActive: true });
  return buildSession(user);
}

function login({ email, password }) {
  const row = userService.findRawByEmail(email);

  // Same message and roughly the same work for "no such user" and "wrong
  // password", so the response cannot be used to discover which emails exist.
  if (!row) {
    verifyPassword(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!verifyPassword(password, row.password_hash)) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!fromDbBool(row.is_active)) {
    throw ApiError.forbidden('Account is deactivated');
  }

  return buildSession(userService.toPublic(row));
}

/**
 * Exchanges a refresh token for a new pair. The old token is revoked in the
 * same transaction (rotation), so a stolen token works at most once.
 */
function refresh(rawToken) {
  const tokenHash = hashRefreshToken(rawToken);
  const record = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash);

  if (!record) throw ApiError.unauthorized('Invalid refresh token');
  if (record.revoked_at) throw ApiError.unauthorized('Refresh token has been used or revoked');
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const user = userService.findById(record.user_id);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  const rotate = db.transaction(() => {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(now(), record.id);
    return buildSession(user);
  });

  return rotate();
}

/** Revokes one refresh token. Logging out twice is not an error. */
function logout(rawToken) {
  db.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
  ).run(now(), hashRefreshToken(rawToken));
}

/** Revokes every refresh token for a user (used after a password change). */
function revokeAllForUser(userId) {
  db.prepare(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  ).run(now(), userId);
}

function changePassword(userId, { currentPassword, newPassword }) {
  const row = userService.findRawById(userId);
  if (!row) throw ApiError.notFound('User not found');
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  const apply = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      now(),
      userId,
    );
    revokeAllForUser(userId);
  });

  apply();
}

/** Deletes refresh tokens that are expired or were revoked long ago. */
function pruneRefreshTokens() {
  const result = db
    .prepare("DELETE FROM refresh_tokens WHERE expires_at < ? OR revoked_at IS NOT NULL")
    .run(now());
  return result.changes;
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  revokeAllForUser,
  changePassword,
  pruneRefreshTokens,
};
