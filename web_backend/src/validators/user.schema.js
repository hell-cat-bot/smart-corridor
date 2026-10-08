'use strict';

const { z } = require('zod');
const { listQuery, text } = require('./common.schema');
const { email, password } = require('./auth.schema');

const ROLES = ['admin', 'dispatcher', 'viewer'];

const createUserSchema = z.object({
  name: text(120, 'name is required'),
  email,
  password,
  role: z.enum(ROLES).default('viewer'),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z
  .object({
    name: text(120).optional(),
    email: email.optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: password.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'no fields to update' });

const listUsersQuery = listQuery.extend({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().max(120).optional(),
});

module.exports = { ROLES, createUserSchema, updateUserSchema, listUsersQuery };
