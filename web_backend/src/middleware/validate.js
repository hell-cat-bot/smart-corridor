'use strict';

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * Validates request input with zod.
 *
 *   router.post('/', validate({ body: createUserSchema }), controller.create);
 *
 * The parsed (and coerced / defaulted) values are put on `req.validated`, never
 * back onto `req.body` / `req.query`, because `req.query` is a read-only getter
 * in Express and silently ignoring the assignment is a classic source of bugs.
 * Controllers therefore always read `req.validated.body`, `req.validated.query`
 * and `req.validated.params`.
 */
function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    req.validated = { body: {}, query: {}, params: {} };

    try {
      if (schemas.params) req.validated.params = schemas.params.parse(req.params);
      if (schemas.query) req.validated.query = schemas.query.parse(req.query);
      if (schemas.body) req.validated.body = schemas.body.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        return next(ApiError.badRequest('Validation failed', details));
      }
      return next(err);
    }
  };
}

module.exports = validate;
