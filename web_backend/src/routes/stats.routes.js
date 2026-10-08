'use strict';

const express = require('express');

const controller = require('../controllers/stats.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const schemas = require('../validators/stats.schema');

const router = express.Router();

router.use(authenticate);

router.get('/overview', asyncHandler(controller.overview));
router.get('/daily', validate({ query: schemas.dailyQuery }), asyncHandler(controller.daily));
router.get(
  '/audit',
  authorize('admin'),
  validate({ query: schemas.auditQuery }),
  asyncHandler(controller.auditLog),
);

module.exports = router;
