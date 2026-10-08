'use strict';

/**
 * The only error type the application throws on purpose.
 * The error handler turns it into a JSON response with the right status code.
 */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message human readable message, safe to show a user
   * @param {object} [details] optional extra information (e.g. field errors)
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }
}

module.exports = ApiError;
