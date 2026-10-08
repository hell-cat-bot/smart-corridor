'use strict';

const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');

function register(req, res) {
  const session = authService.register(req.validated.body);
  auditService.record({ userId: session.user.id, action: 'auth.register', entity: 'user', entityId: session.user.id });
  res.status(201).json(session);
}

function login(req, res) {
  const session = authService.login(req.validated.body);
  auditService.record({ userId: session.user.id, action: 'auth.login', entity: 'user', entityId: session.user.id });
  res.json(session);
}

function refresh(req, res) {
  const session = authService.refresh(req.validated.body.refreshToken);
  res.json(session);
}

function logout(req, res) {
  authService.logout(req.validated.body.refreshToken);
  res.status(204).send();
}

function me(req, res) {
  res.json(req.user);
}

function changePassword(req, res) {
  authService.changePassword(req.user.id, req.validated.body);
  auditService.record({ userId: req.user.id, action: 'auth.password_change', entity: 'user', entityId: req.user.id });
  // Every refresh token was revoked, so the client must log in again.
  res.status(204).send();
}

module.exports = { register, login, refresh, logout, me, changePassword };
