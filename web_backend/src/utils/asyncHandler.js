'use strict';

/**
 * Express 4 does not forward errors thrown inside an async handler.
 * Wrapping every handler in this keeps `try/catch` out of the controllers:
 * any thrown error (sync or async) ends up in the central error handler.
 *
 *   router.get('/', asyncHandler(controller.list));
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
