'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const schemas = require('../validators/auth.schema');

const router = express.Router();

// Slows down password guessing without getting in the way of normal use.
// Disabled while running the test suite so the smoke test is not throttled.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

router.post('/register', authLimiter, validate({ body: schemas.registerSchema }), asyncHandler(controller.register));
router.post('/login', authLimiter, validate({ body: schemas.loginSchema }), asyncHandler(controller.login));
router.post('/refresh', validate({ body: schemas.refreshSchema }), asyncHandler(controller.refresh));
router.post('/logout', validate({ body: schemas.refreshSchema }), asyncHandler(controller.logout));

router.get('/me', authenticate, asyncHandler(controller.me));
router.post(
  '/change-password',
  authenticate,
  validate({ body: schemas.changePasswordSchema }),
  asyncHandler(controller.changePassword),
);

module.exports = router;
