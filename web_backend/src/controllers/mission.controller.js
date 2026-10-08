'use strict';

const missionService = require('../services/mission.service');
const auditService = require('../services/audit.service');

function list(req, res) {
  res.json(missionService.list(req.validated.query));
}

function getOne(req, res) {
  res.json(missionService.getByIdOrFail(req.validated.params.id));
}

function create(req, res) {
  const mission = missionService.create(req.validated.body, req.user.id);
  auditService.record({ userId: req.user.id, action: 'mission.create', entity: 'mission', entityId: mission.id });
  res.status(201).json(mission);
}

function update(req, res) {
  const { id } = req.validated.params;
  const mission = missionService.update(id, req.validated.body);
  auditService.record({
    userId: req.user.id,
    action: 'mission.update',
    entity: 'mission',
    entityId: id,
    details: { fields: Object.keys(req.validated.body) },
  });
  res.json(mission);
}

function updateStatus(req, res) {
  const { id } = req.validated.params;
  const { status } = req.validated.body;
  const mission = missionService.setStatus(id, status);
  auditService.record({
    userId: req.user.id,
    action: 'mission.status',
    entity: 'mission',
    entityId: id,
    details: { status },
  });
  res.json(mission);
}

function remove(req, res) {
  const { id } = req.validated.params;
  missionService.remove(id);
  auditService.record({ userId: req.user.id, action: 'mission.delete', entity: 'mission', entityId: id });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, updateStatus, remove };
