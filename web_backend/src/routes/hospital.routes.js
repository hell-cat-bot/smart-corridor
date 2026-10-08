'use strict';

const express = require('express');

const controller = require('../controllers/hospital.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const { idParam } = require('../validators/common.schema');
const schemas = require('../validators/hospital.schema');

const router = express.Router();

// Everyone signed in can read; only dispatchers and admins can write.
router.use(authenticate);

router.get('/', validate({ query: schemas.listHospitalsQuery }), asyncHandler(controller.list));
router.get('/:id', validate({ params: idParam }), asyncHandler(controller.getOne));

router.post(
  '/',
  authorize('admin', 'dispatcher'),
  validate({ body: schemas.createHospitalSchema }),
  asyncHandler(controller.create),
);
router.patch(
  '/:id',
  authorize('admin', 'dispatcher'),
  validate({ params: idParam, body: schemas.updateHospitalSchema }),
  asyncHandler(controller.update),
);
router.delete('/:id', authorize('admin'), validate({ params: idParam }), asyncHandler(controller.remove));

module.exports = router;
