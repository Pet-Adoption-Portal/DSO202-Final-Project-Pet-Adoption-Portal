// App shell: hash router, navigation bar, request-log drawer.

import { api, getLog, onLog, config } from './api.js';
import { currentUser, clearSession, is } from './auth.js';
import { esc, $ } from './ui.js';
import { loadFavorites, resetFavorites } from './favorites.js';

import home from './pages/home.js';
import browse from './pages/browse.js';
import petDetail from './pages/pet.js';
import apply from './pages/apply.js';
import login from './pages/login.js';
import signup from './pages/signup.js';
import profile from './pages/profile.js';
import favorites from './pages/favorites.js';
import applications from './pages/applications.js';
import notifications from './pages/notifications.js';
import shelters from './pages/shelters.js';
import shelter from './pages/shelter.js';
import staff from './pages/staff.js';
import petForm from './pages/pet-form.js';
import reports from './pages/reports.js';
import admin from './pages/admin.js';
import notFound from './pages/notfound.js';

// [pattern, page, allowed roles (empty = public), title]
const routes = [
  ['/', home, [], 'Home'],
  ['/pets', browse, [], 'Find a pet'],
  ['/pets/:id', petDetail, [], 'Pet'],
  ['/apply/:id', apply, ['adopter'], 'Apply to adopt'],
  ['/login', login, [], 'Log in'],
  ['/signup', signup, [], 'Create an account'],
  ['/profile', profile, ['adopter', 'staff', 'admin'], 'Profile'],
  ['/favorites', favorites, ['adopter'], 'Saved pets'],
  ['/applications', applications, ['adopter'], 'My applications'],
  ['/notifications', notifications, ['adopter', 'staff', 'admin'], 'Notifications'],
  ['/shelters', shelters, [], 'Shelters'],
  ['/shelters/:id', shelter, [], 'Shelter'],
  ['/staff', staff, ['staff'], 'Shelter dashboard'],
  ['/staff/pets/new', petForm, ['staff'], 'List a pet'],
  ['/staff/pets/:id/edit', petForm, ['staff'], 'Edit pet'],
  ['/reports', reports, ['staff', 'admin'], 'Reports'],
  ['/admin', admin, ['admin'], 'Admin'],
];

function matchRoute(path) {
  for (const [pattern, page, roles, title] of routes) {
    const a = pattern.split('/'), b = path.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) { ok = false; break; }
    }
    if (ok) return { page, roles, title, params };
  }
  return { page: notFound, roles: [], title: 'Not found', params: {} };
}

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

/* ---------- navigation bar ---------- */
let unread = 0;
async function refreshUnread() {
  if (!is.loggedIn()) { unread = 0; return; }
  try { unread = (await api.get('/notifications')).unread; } catch { unread = 0; }
}

function renderNav(path) {
  const u = currentUser();
  const link = (href, label, extra = '') => {
    const active = href === '#' + path || (href !== '#/' && ('#' + path).startsWith(href + '/'));
    return `<a href="${href}"${active ? ' aria-current="page"' : ''}>${label}${extra}</a>`;
  };
  const bell = unread ? `<span class="pill" aria-label="${unread} unread">${unread}</span>` : '';
  let html = link('#/pets', 'Find a pet') + link('#/shelters', 'Shelters');
  if (!u) {
    html += link('#/login', 'Log in') + `<a class="btn btn-primary btn-small" href="#/signup">Create account</a>`;
  } else {
    if (u.role === 'adopter') html += link('#/favorites', 'Saved') + link('#/applications', 'Applications');
    if (u.role === 'staff') html += link('#/staff', 'Dashboard') + link('#/reports', 'Reports');
    if (u.role === 'admin') html += link('#/admin', 'Admin') + link('#/reports', 'Reports');
    html += link('#/notifications', 'Notifications', bell) + link('#/profile', esc(u.name?.split(' ')[0] || 'Profile'));
    html += `<button class="navlink" id="logoutBtn" type="button">Log out</button>`;
  }
  const nav = $('#nav');
  nav.innerHTML = html;
  $('#logoutBtn')?.addEventListener('click', () => {
    clearSession();
    resetFavorites();
    location.hash = '#/';
    window.dispatchEvent(new Event('session-changed'));
  });
}

/* ---------- router ---------- */
let renderId = 0;
async function render() {
  const id = ++renderId;
  const { path, query } = parseHash();
  const { page, roles, title, params } = matchRoute(path);
  const main = $('#main');
  $('#nav').classList.remove('open');
  $('#navToggle').setAttribute('aria-expanded', 'false');

  const u = currentUser();
  if (roles.length && !u) { location.hash = `#/login?next=${encodeURIComponent('#' + path)}`; return; }
  if (roles.length && !roles.includes(u.role)) {
    main.innerHTML = `<div class="wrap wrap-narrow"><h1>This page is for ${esc(roles.join(' or '))} accounts</h1><p class="muted">You are logged in as ${esc(u.role)}.</p><a class="btn btn-outline" href="#/">Go to home</a></div>`;
    return;
  }

  document.title = `${title} | Pet Adoption Portal`;
  main.innerHTML = '<div class="loading">Loading</div>';
  await Promise.all([refreshUnread(), loadFavorites()]);
  if (id !== renderId) return;
  renderNav(path);
  try {
    await page({ main, params, query, rerender: render, isCurrent: () => id === renderId });
  } catch (err) {
    if (id !== renderId) return;
    main.innerHTML = `<div class="wrap wrap-narrow"><h1>Something went wrong</h1><p class="form-error">${esc(err.message)}</p><a class="btn btn-outline" href="#/">Go to home</a></div>`;
  }
  if (id === renderId) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}

/* ---------- request log drawer ---------- */
function renderLog() {
  $('#logList').innerHTML = getLog().map((e) => e.type === 'event'
    ? `<li class="ev"><span class="m">event</span><span>${esc(e.stream)}</span><span>to ${esc(e.consumers.join(', '))}</span></li>`
    : `<li><span class="m">${esc(e.method)}</span><span>${esc(e.path)}<br><span class="svc">${esc(e.service)}</span>, ${e.ms} ms</span><span class="${e.status < 400 ? 'code-ok' : 'code-bad'}">${e.status}</span></li>`
  ).join('') || '<li>No requests yet.</li>';
}

function init() {
  const env = $('#envBadge');
  env.className = 'env' + (config.apiMode === 'live' ? ' env-live' : '');
  env.textContent = config.apiMode === 'live' ? `Live API (${config.environment})` : 'Mock API';
  env.title = config.apiMode === 'live' ? `Calls go to ${config.apiBase}` : 'All data is simulated in this browser';

  $('#navToggle').addEventListener('click', () => {
    const open = $('#nav').classList.toggle('open');
    $('#navToggle').setAttribute('aria-expanded', String(open));
  });
  const drawer = $('#logDrawer');
  $('#openLog').addEventListener('click', () => { drawer.hidden = false; renderLog(); $('#closeLog').focus(); });
  $('#closeLog').addEventListener('click', () => { drawer.hidden = true; $('#openLog').focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) drawer.hidden = true; });
  onLog(() => { if (!drawer.hidden) renderLog(); });

  window.addEventListener('hashchange', render);
  window.addEventListener('session-changed', render);
  render();
}

init();
