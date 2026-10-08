'use strict';

const express = require('express');

const controller = require('../controllers/incident.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const { idParam } = require('../validators/common.schema');
const schemas = require('../validators/incident.schema');

const router = express.Router();

router.use(authenticate);

router.get('/', validate({ query: schemas.listIncidentsQuery }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParam }), asyncHandler(controller.getOne));

router.post(
  '/',
  authorize('admin', 'dispatcher'),
  validate({ body: schemas.createIncidentSchema }),
  asyncHandler(controller.create),
);
router.patch(
  '/:id',
  authorize('admin', 'dispatcher'),
  validate({ params: idParam, body: schemas.updateIncidentSchema }),
  asyncHandler(controller.update),
);
router.post(
  '/:id/resolve',
  authorize('admin', 'dispatcher'),
  validate({ params: idParam }),
  asyncHandler(controller.resolve),
);
router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(controller.remove));

module.exports = router;
