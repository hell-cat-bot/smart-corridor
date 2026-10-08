'use strict';

const { z } = require('zod');
const { text } = require('./common.schema');

const email = z.string().trim().toLowerCase().email('must be a valid email address');
const password = z.string().min(8, 'must be at least 8 characters').max(128);

const registerSchema = z.object({
  name: text(120, 'name is required'),
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'currentPassword is required'),
  newPassword: password,
});

module.exports = { registerSchema, loginSchema, refreshSchema, changePasswordSchema, email, password };
