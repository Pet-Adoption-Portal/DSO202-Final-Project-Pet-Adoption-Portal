// Errors every service throws. The error handler turns them into the contract's
// JSON shape: { "error": "Message a person can read", "code": "OPTIONAL_CODE" }.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.statusCode = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Log in to continue.') => new HttpError(401, msg);
export const forbidden = (msg = 'Your account cannot do this.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const conflict = (msg, code) => new HttpError(409, msg, code);

/** Throws `error` unless `condition` is truthy. Keeps handlers short: `need(pet, notFound('Pet not found.'))`. */
export function need(condition, error) {
  if (!condition) throw error;
  return condition;
}
