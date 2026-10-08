'use strict';

const express = require('express');

const controller = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const { idParam } = require('../validators/common.schema');
const schemas = require('../validators/user.schema');

const router = express.Router();

// User management is admin-only, end to end.
router.use(authenticate, authorize('admin'));

router.get('/', validate({ query: schemas.listUsersQuery }), asyncHandler(controller.list));
router.post('/', validate({ body: schemas.createUserSchema }), asyncHandler(controller.create));
router.get('/:id', validate({ params: idParam }), asyncHandler(controller.getOne));
router.patch(
  '/:id',
  validate({ params: idParam, body: schemas.updateUserSchema }),
  asyncHandler(controller.update),
);
router.delete('/:id', validate({ params: idParam }), asyncHandler(controller.remove));

module.exports = router;
