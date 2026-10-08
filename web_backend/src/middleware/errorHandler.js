'use strict';

const ApiError = require('../utils/ApiError');
const config = require('../config');

/** 404 for any route that did not match. Mounted after every router. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * The single place that turns an error into a response. Every error response
 * has the same shape:
 *
 *   { "error": { "message": "...", "details": [...] } }
 */
// eslint-disable-next-line no-unused-vars -- Express needs all four parameters.
function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err && err.type === 'entity.parse.failed') {
    // Thrown by express.json() when the body is not valid JSON.
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    // Unique / foreign key / check violations reach here if a service missed one.
    status = 409;
    message = 'Database constraint failed';
    details = config.isProduction ? undefined : err.message;
  }

  if (status >= 500) {
    console.error('[error]', err);
  }

  const body = { error: { message } };
  if (details !== undefined) body.error.details = details;
  if (!config.isProduction && status >= 500) body.error.stack = err.stack;

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
