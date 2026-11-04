// Session handling. The JWT from login-service is kept in sessionStorage
// (cleared when the tab closes) and sent as "Authorization: Bearer <token>".
// The api-gateway is the only component that verifies it (design decision D5).

const KEY = 'pap.session';

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
export function getToken() { return getSession()?.token || null; }
export function currentUser() { return getSession()?.user || null; }
export function setSession(token, user) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ token, user })); } catch { /* ignore */ }
}
export function updateUser(patch) {
  const s = getSession();
  if (s) setSession(s.token, { ...s.user, ...patch });
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
export const is = {
  loggedIn: () => !!currentUser(),
  adopter: () => currentUser()?.role === 'adopter',
  staff: () => currentUser()?.role === 'staff',
  admin: () => currentUser()?.role === 'admin',
};
