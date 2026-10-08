'use strict';

const express = require('express');

const controller = require('../controllers/vehicle.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const { idParam } = require('../validators/common.schema');
const schemas = require('../validators/vehicle.schema');

const router = express.Router();

router.use(authenticate);

router.get('/', validate({ query: schemas.listVehiclesQuery }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParam }), asyncHandler(controller.getOne));

router.post(
  '/',
  authorize('admin', 'dispatcher'),
  validate({ body: schemas.createVehicleSchema }),
  asyncHandler(controller.create),
);
router.patch(
  '/:id',
  authorize('admin', 'dispatcher'),
  validate({ params: idParam, body: schemas.updateVehicleSchema }),
  asyncHandler(controller.update),
);
router.patch(
  '/:id/status',
  authorize('admin', 'dispatcher'),
  validate({ params: idParam, body: schemas.updateStatusSchema }),
  asyncHandler(controller.updateStatus),
);
router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(controller.remove));

module.exports = router;
