// A small error type that carries an HTTP status and a user-facing message.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details; // e.g. { field: 'message' } for validation errors
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'Please log in to continue.') => new HttpError(401, msg);
const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, msg);
const notFound = (msg = 'The requested record was not found.') => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
