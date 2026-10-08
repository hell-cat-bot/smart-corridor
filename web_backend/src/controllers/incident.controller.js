'use strict';

const incidentService = require('../services/incident.service');
const auditService = require('../services/audit.service');

function list(req, res) {
  res.json(incidentService.list(req.validated.query));
}

function getOne(req, res) {
  res.json(incidentService.getByIdOrFail(req.validated.params.id));
}

function create(req, res) {
  const incident = incidentService.create(req.validated.body, req.user.id);
  auditService.record({ userId: req.user.id, action: 'incident.create', entity: 'incident', entityId: incident.id });
  res.status(201).json(incident);
}

function update(req, res) {
  const { id } = req.validated.params;
  const incident = incidentService.update(id, req.validated.body);
  auditService.record({
    userId: req.user.id,
    action: 'incident.update',
    entity: 'incident',
    entityId: id,
    details: { fields: Object.keys(req.validated.body) },
  });
  res.json(incident);
}

function resolve(req, res) {
  const { id } = req.validated.params;
  const incident = incidentService.resolve(id);
  auditService.record({ userId: req.user.id, action: 'incident.resolve', entity: 'incident', entityId: id });
  res.json(incident);
}

function remove(req, res) {
  const { id } = req.validated.params;
  incidentService.remove(id);
  auditService.record({ userId: req.user.id, action: 'incident.delete', entity: 'incident', entityId: id });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, resolve, remove };
