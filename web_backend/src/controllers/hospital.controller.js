'use strict';

const hospitalService = require('../services/hospital.service');
const auditService = require('../services/audit.service');

function list(req, res) {
  res.json(hospitalService.list(req.validated.query));
}

function getOne(req, res) {
  res.json(hospitalService.getByIdOrFail(req.validated.params.id));
}

function create(req, res) {
  const hospital = hospitalService.create(req.validated.body);
  auditService.record({ userId: req.user.id, action: 'hospital.create', entity: 'hospital', entityId: hospital.id });
  res.status(201).json(hospital);
}

function update(req, res) {
  const { id } = req.validated.params;
  const hospital = hospitalService.update(id, req.validated.body);
  auditService.record({
    userId: req.user.id,
    action: 'hospital.update',
    entity: 'hospital',
    entityId: id,
    details: { fields: Object.keys(req.validated.body) },
  });
  res.json(hospital);
}

function remove(req, res) {
  const { id } = req.validated.params;
  hospitalService.remove(id);
  auditService.record({ userId: req.user.id, action: 'hospital.delete', entity: 'hospital', entityId: id });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
