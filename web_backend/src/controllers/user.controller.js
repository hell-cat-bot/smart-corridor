'use strict';

const userService = require('../services/user.service');
const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');
const ApiError = require('../utils/ApiError');

function list(req, res) {
  res.json(userService.list(req.validated.query));
}

function getOne(req, res) {
  res.json(userService.getByIdOrFail(req.validated.params.id));
}

function create(req, res) {
  const user = userService.create(req.validated.body);
  auditService.record({ userId: req.user.id, action: 'user.create', entity: 'user', entityId: user.id });
  res.status(201).json(user);
}

function update(req, res) {
  const { id } = req.validated.params;
  const payload = req.validated.body;

  // An admin must not lock themselves out of their own account.
  if (id === req.user.id) {
    if (payload.role !== undefined && payload.role !== req.user.role) {
      throw ApiError.badRequest('You cannot change your own role');
    }
    if (payload.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }
  }

  const user = userService.update(id, payload);

  // A changed password or a deactivated account must end existing sessions.
  if (payload.password !== undefined || payload.isActive === false) {
    authService.revokeAllForUser(id);
  }

  auditService.record({
    userId: req.user.id,
    action: 'user.update',
    entity: 'user',
    entityId: id,
    details: { fields: Object.keys(payload) },
  });
  res.json(user);
}

function remove(req, res) {
  const { id } = req.validated.params;
  if (id === req.user.id) throw ApiError.badRequest('You cannot delete your own account');

  userService.remove(id);
  auditService.record({ userId: req.user.id, action: 'user.delete', entity: 'user', entityId: id });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
