'use strict';

const express = require('express');

const controller = require('../controllers/integration.controller');
const authenticate = require('../middleware/authenticate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.get('/status', asyncHandler(controller.status));

module.exports = router;
