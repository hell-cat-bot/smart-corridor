'use strict';

const vehicleService = require('../services/vehicle.service');
const auditService = require('../services/audit.service');

function list(req, res) {
  res.json(vehicleService.list(req.validated.query));
}

function getOne(req, res) {
  res.json(vehicleService.getByIdOrFail(req.validated.params.id));
}

function create(req, res) {
  const vehicle = vehicleService.create(req.validated.body);
  auditService.record({ userId: req.user.id, action: 'vehicle.create', entity: 'vehicle', entityId: vehicle.id });
  res.status(201).json(vehicle);
}

function update(req, res) {
  const { id } = req.validated.params;
  const vehicle = vehicleService.update(id, req.validated.body);
  auditService.record({
    userId: req.user.id,
    action: 'vehicle.update',
    entity: 'vehicle',
    entityId: id,
    details: { fields: Object.keys(req.validated.body) },
  });
  res.json(vehicle);
}

function updateStatus(req, res) {
  const { id } = req.validated.params;
  const { status } = req.validated.body;
  const vehicle = vehicleService.setStatus(id, status);
  auditService.record({
    userId: req.user.id,
    action: 'vehicle.status',
    entity: 'vehicle',
    entityId: id,
    details: { status },
  });
  res.json(vehicle);
}

function remove(req, res) {
  const { id } = req.validated.params;
  vehicleService.remove(id);
  auditService.record({ userId: req.user.id, action: 'vehicle.delete', entity: 'vehicle', entityId: id });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, updateStatus, remove };
