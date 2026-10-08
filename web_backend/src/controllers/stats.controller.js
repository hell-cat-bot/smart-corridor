'use strict';

const statsService = require('../services/stats.service');
const auditService = require('../services/audit.service');

function overview(req, res) {
  res.json(statsService.overview());
}

function daily(req, res) {
  res.json(statsService.daily(req.validated.query.days));
}

function auditLog(req, res) {
  res.json(auditService.list(req.validated.query));
}

module.exports = { overview, daily, auditLog };
