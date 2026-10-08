'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');

/** Hashes a plain-text password. Never store the plain text anywhere. */
function hashPassword(plain) {
  return bcrypt.hashSync(plain, config.bcryptRounds);
}

/** Constant-time comparison of a plain-text password against a stored hash. */
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
