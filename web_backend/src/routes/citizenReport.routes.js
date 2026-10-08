'use strict';

const express = require('express');
const controller = require('../controllers/citizenReport.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Public reporting endpoints - zero auth required for immediate emergency response
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.getOne));
router.post('/', asyncHandler(controller.create));
router.post('/:id/analyze', asyncHandler(controller.analyze));
router.patch('/:id/dispatch', asyncHandler(controller.markDispatched));
router.patch('/:id/cancel', asyncHandler(controller.markCancelled));

module.exports = router;
