// Runtime configuration for the frontend.
// apiMode:
//   'mock' -> every /api call is answered inside the browser by js/mock/server.js
//             (no backend needed; data lives in localStorage).
//   'live' -> calls go to `${apiBase}/...`, i.e. the real api-gateway through the Ingress.
// In Kubernetes, mount a ConfigMap over /usr/share/nginx/html/config.js to switch modes
// per environment without rebuilding the image.
window.__PORTAL_CONFIG__ = window.__PORTAL_CONFIG__ || {
  apiMode: 'mock',
  apiBase: '/api',
  environment: 'local',
};
