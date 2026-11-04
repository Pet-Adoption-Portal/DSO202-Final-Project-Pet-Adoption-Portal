// Who is calling? The api-gateway verifies the JWT once (proposal decision D5) and forwards
// the claims as headers. Services trust these headers, which is only safe because
// NetworkPolicy blocks every caller except the gateway (tested in experiment E9).
import { forbidden, unauthorized } from './errors.js';

/** Returns { id, role, shelterId } or null for anonymous requests. */
export function userFrom(request) {
  const id = request.headers['x-user-id'];
  if (!id) return null;
  return {
    id: String(id),
    role: String(request.headers['x-user-role'] || ''),
    shelterId: request.headers['x-shelter-id'] ? String(request.headers['x-shelter-id']) : null,
  };
}

/** The caller must be logged in. */
export function requireUser(request) {
  const user = userFrom(request);
  if (!user) throw unauthorized();
  return user;
}

/** The caller must be logged in with one of these roles, e.g. requireRole(req, 'staff'). */
export function requireRole(request, ...roles) {
  const user = requireUser(request);
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}
