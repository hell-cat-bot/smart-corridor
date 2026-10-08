'use strict';

const citizenReportService = require('../services/citizenReport.service');

function list(req, res) {
  const status = req.query.status;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const reports = citizenReportService.list({ status, limit });
  res.json(reports);
}

function getOne(req, res) {
  const report = citizenReportService.getByIdOrFail(req.params.id);
  res.json(report);
}

async function create(req, res) {
  const report = await citizenReportService.create(req.body);
  res.status(201).json(report);
}

function markDispatched(req, res) {
  const report = citizenReportService.markDispatched(req.params.id);
  res.json(report);
}

function markCancelled(req, res) {
  const report = citizenReportService.markCancelled(req.params.id);
  res.json(report);
}

async function analyze(req, res) {
  const report = await citizenReportService.analyzeReport(req.params.id);
  res.json(report);
}

module.exports = {
  list,
  getOne,
  create,
  markDispatched,
  markCancelled,
  analyze,
};
