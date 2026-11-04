// The ONLY place the frontend talks to the backend.
// Pages call api.get('/pets/123') etc. In 'mock' mode the call is answered in the browser;
// in 'live' mode it goes to the api-gateway at `${apiBase}` (e.g. /api/pets/123).

import { mockRequest, onEvent } from './mock/server.js';
import { getToken, clearSession } from './auth.js';

const cfg = window.__PORTAL_CONFIG__ || { apiMode: 'mock', apiBase: '/api' };

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

/* request log, shown in the footer drawer */
const log = [];
const listeners = new Set();
export function onLog(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getLog() { return log; }
function push(entry) { log.unshift({ at: Date.now(), ...entry }); if (log.length > 100) log.pop(); listeners.forEach((f) => f(log)); }
onEvent((e) => push({ type: 'event', ...e }));

// Guess the owning service from the first path segment (matches the gateway's routing table).
function serviceFor(path) {
  const seg = path.split('?')[0].split('/')[1];
  const map = { adoptions: 'adoption', pets: 'pet', shelters: 'shelter', reviews: 'review', reports: 'reporting', notifications: 'notification' };
  return map[seg] || seg;
}

async function request(method, path, body) {
  const token = getToken();
  const started = performance.now();
  let res;
  if (cfg.apiMode === 'mock') {
    res = await mockRequest(method, path, body, token);
  } else {
    try {
      const r = await fetch(cfg.apiBase + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      if (r.status !== 204) { try { data = await r.json(); } catch { data = null; } }
      res = { status: r.status, data, service: r.headers.get('X-Served-By') || serviceFor(path) };
    } catch {
      res = { status: 0, data: { error: 'Cannot reach the server. Check that the api-gateway is running.' }, service: 'api-gateway' };
    }
  }
  push({ type: 'call', method, path, status: res.status, service: res.service, ms: Math.round(performance.now() - started) });

  if (res.status === 401 && token) {
    clearSession();
    window.dispatchEvent(new Event('session-changed'));
  }
  if (res.status === 0 || res.status >= 400) {
    throw new ApiError(res.status, res.data?.error || `Request failed (${res.status})`, res.data);
  }
  return res.data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  put: (p, b) => request('PUT', p, b || {}),
  patch: (p, b) => request('PATCH', p, b || {}),
  del: (p) => request('DELETE', p),
};

export const config = cfg;
