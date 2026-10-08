'use strict';

const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/hospitals', require('./hospital.routes'));
router.use('/vehicles', require('./vehicle.routes'));
router.use('/incidents', require('./incident.routes'));
router.use('/missions', require('./mission.routes'));
router.use('/stats', require('./stats.routes'));
router.use('/integration', require('./integration.routes'));
router.use('/citizen-reports', require('./citizenReport.routes'));

module.exports = router;
