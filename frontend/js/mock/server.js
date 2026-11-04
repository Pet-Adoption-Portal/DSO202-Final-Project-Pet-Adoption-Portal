// In-browser mock of the api-gateway and the 13 backend services behind it.
//
// Every route below is tagged with the service that will own it. When a real
// service is built, it must expose the same method, path, request body and
// response shape (see docs/API-CONTRACT.md); the frontend then switches to
// apiMode 'live' and nothing in the pages changes.
//
// Side effects travel as events on three "streams", like Redis Streams in the
// real design: pet.created, application.decided, email.queue.

import { db, save, uid } from './db.js';

/* ---------- tiny JWT stand-in (gateway checks it once) ---------- */
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));
function issueToken(user) {
  const claims = { sub: user.id, role: user.role, shelter_id: user.shelterId, exp: Date.now() + 8 * 3600 * 1000 };
  return `mock.${enc(claims)}.sig`;
}
function readToken(token) {
  if (!token) return null;
  try {
    const claims = dec(token.split('.')[1]);
    return claims.exp > Date.now() ? claims : null;
  } catch { return null; }
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const need = (cond, status, msg) => { if (!cond) fail(status, msg); };

/* ---------- event bus (Redis Streams stand-in) ---------- */
let eventListener = () => {};
export function onEvent(fn) { eventListener = fn; }

const consumers = {
  'pet.created': [
    ['search', () => { /* search reads the pet index directly in the mock */ }],
    ['adoption', (e) => { db().adoption.availability[e.petId] = { petId: e.petId, status: 'available', applicationId: null }; }],
  ],
  'application.decided': [
    ['notification', (e) => {
      const d = db();
      const title = e.decision === 'approved' ? `Your application for ${e.petName} was approved` : `Update on your application for ${e.petName}`;
      d.notification.items.unshift({ id: uid('n'), userId: e.userId, title, body: e.note || (e.decision === 'approved' ? 'The shelter will contact you to arrange the handover.' : 'The shelter chose another home this time. Other pets are still waiting.'), link: '#/applications', read: false, createdAt: new Date().toISOString() });
      publish('email.queue', { to: e.userEmail, subject: title, body: e.note || '' });
    }],
    ['history', (e) => {
      db().history.entries.unshift({ id: uid('h'), userId: e.userId, applicationId: e.applicationId, petId: e.petId, petName: e.petName, shelterId: e.shelterId, outcome: e.decision, at: new Date().toISOString() });
    }],
    ['reporting', (e) => { const r = db().reporting.decided; r[e.decision] = (r[e.decision] || 0) + 1; }],
  ],
  'email.queue': [
    ['email-worker', (e) => { db().email.outbox.unshift({ id: uid('mail'), ...e, sentAt: new Date().toISOString() }); }],
  ],
};

function publish(stream, payload) {
  const event = { id: uid('evt'), stream, ...payload };
  const d = db();
  for (const [service, handle] of consumers[stream] || []) {
    // Redis Streams is at-least-once, so every consumer records what it has processed.
    const seen = (d.processed[service] ||= []);
    if (seen.includes(event.id)) continue;
    handle(event);
    seen.push(event.id);
    if (seen.length > 200) seen.shift();
  }
  eventListener({ stream, consumers: (consumers[stream] || []).map(([s]) => s) });
}

/* ---------- helpers that join data the way the gateway/frontend would ---------- */
const shelterById = (id) => db().shelter.shelters.find((s) => s.id === id);
const userById = (id) => db().signup.users.find((u) => u.id === id);
const profileOf = (id) => db().profile.profiles[id] || { name: '' };
function petView(p) {
  const av = db().adoption.availability[p.id] || { status: 'available' };
  return { ...p, status: av.status, shelterName: shelterById(p.shelterId)?.name || '' };
}
function publicUser(u) {
  return { id: u.id, email: u.email, role: u.role, shelterId: u.shelterId, name: profileOf(u.id).name };
}
function requireRole(claims, ...roles) {
  need(claims, 401, 'Log in to continue.');
  need(roles.includes(claims.role), 403, 'Your account cannot do this.');
}
function staffShelter(claims) {
  requireRole(claims, 'staff');
  const s = shelterById(claims.shelter_id);
  need(s, 403, 'No shelter is linked to this account.');
  need(s.status === 'approved', 403, 'Your shelter is waiting for admin approval.');
  return s;
}

/* ---------- routes: [method, path, service, handler(ctx)] ---------- */
const routes = [
  // ----- signup-service -----
  ['POST', '/signup', 'signup', ({ body }) => {
    const d = db();
    const email = String(body.email || '').trim().toLowerCase();
    need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 400, 'Enter a valid email address.');
    need(String(body.password || '').length >= 8, 400, 'Use a password of at least 8 characters.');
    need(String(body.name || '').trim(), 400, 'Enter your name.');
    need(!d.signup.users.some((u) => u.email === email), 409, 'An account with this email already exists. Log in instead.');
    const role = body.role === 'staff' ? 'staff' : 'adopter';
    let shelterId = null;
    if (role === 'staff') {
      need(String(body.shelterName || '').trim(), 400, 'Enter your shelter\'s name.');
      shelterId = uid('sh');
      d.shelter.shelters.push({ id: shelterId, name: body.shelterName.trim(), district: body.district || '', address: '', phone: '', email, about: '', status: 'pending', createdAt: new Date().toISOString() });
    }
    const user = { id: uid('u'), email, password: body.password, role, shelterId, createdAt: new Date().toISOString() };
    d.signup.users.push(user);
    d.profile.profiles[user.id] = { userId: user.id, name: body.name.trim(), phone: '', district: body.district || '', homeType: '', hasYard: false, otherPets: '', about: '' };
    return { status: 201, data: { user: publicUser(user) } };
  }],

  // ----- login-service -----
  ['POST', '/login', 'login', ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = db().signup.users.find((u) => u.email === email);
    need(user && user.password === body.password, 401, 'That email and password do not match.');
    return { data: { token: issueToken(user), user: publicUser(user) } };
  }],

  // ----- profile-service -----
  ['GET', '/profile', 'profile', ({ claims }) => {
    need(claims, 401, 'Log in to continue.');
    const u = userById(claims.sub);
    return { data: { ...profileOf(claims.sub), email: u.email, role: u.role } };
  }],
  ['PUT', '/profile', 'profile', ({ claims, body }) => {
    need(claims, 401, 'Log in to continue.');
    need(String(body.name || '').trim(), 400, 'Enter your name.');
    const allowed = ['name', 'phone', 'district', 'homeType', 'hasYard', 'otherPets', 'about'];
    const p = db().profile.profiles[claims.sub] ||= { userId: claims.sub };
    for (const k of allowed) if (k in body) p[k] = body[k];
    return { data: p };
  }],

  // ----- search-service -----
  ['GET', '/search', 'search', ({ query }) => {
    let list = db().pet.pets.map(petView);
    const q = (query.q || '').trim().toLowerCase();
    if (q) list = list.filter((p) => [p.name, p.breed, p.description, p.shelterName].join(' ').toLowerCase().includes(q));
    if (query.species) list = list.filter((p) => p.species === query.species);
    if (query.sex) list = list.filter((p) => p.sex === query.sex);
    if (query.size) list = list.filter((p) => p.size === query.size);
    if (query.shelterId) list = list.filter((p) => p.shelterId === query.shelterId);
    if (query.age === 'young') list = list.filter((p) => p.ageMonths < 12);
    if (query.age === 'adult') list = list.filter((p) => p.ageMonths >= 12 && p.ageMonths < 84);
    if (query.age === 'senior') list = list.filter((p) => p.ageMonths >= 84);
    if (query.status !== 'all') list = list.filter((p) => p.status === (query.status || 'available'));
    if (query.goodWith) list = list.filter((p) => p.goodWith.includes(query.goodWith));
    const sorts = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      youngest: (a, b) => a.ageMonths - b.ageMonths,
      oldest: (a, b) => b.ageMonths - a.ageMonths,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    list.sort(sorts[query.sort] || sorts.newest);
    const limit = Number(query.limit) || list.length;
    return { data: { total: list.length, items: list.slice(0, limit) } };
  }],

  // ----- pet-service -----
  ['GET', '/pets', 'pet', ({ query }) => {
    let list = db().pet.pets;
    if (query.shelterId) list = list.filter((p) => p.shelterId === query.shelterId);
    return { data: list.map(petView) };
  }],
  ['GET', '/pets/:id', 'pet', ({ params }) => {
    const p = db().pet.pets.find((x) => x.id === params.id);
    need(p, 404, 'This pet is no longer listed.');
    return { data: petView(p) };
  }],
  ['POST', '/pets', 'pet', ({ claims, body }) => {
    const s = staffShelter(claims);
    validatePet(body);
    const pet = { id: uid('pet'), ...pickPet(body), shelterId: s.id, createdAt: new Date().toISOString() };
    db().pet.pets.push(pet);
    publish('pet.created', { petId: pet.id, shelterId: s.id });
    return { status: 201, data: petView(pet) };
  }],
  ['PUT', '/pets/:id', 'pet', ({ claims, params, body }) => {
    const s = staffShelter(claims);
    const pet = db().pet.pets.find((x) => x.id === params.id);
    need(pet, 404, 'Pet not found.');
    need(pet.shelterId === s.id, 403, 'You can only edit your own shelter\'s pets.');
    validatePet(body);
    Object.assign(pet, pickPet(body));
    return { data: petView(pet) };
  }],
  ['DELETE', '/pets/:id', 'pet', ({ claims, params }) => {
    const s = staffShelter(claims);
    const d = db();
    const pet = d.pet.pets.find((x) => x.id === params.id);
    need(pet, 404, 'Pet not found.');
    need(pet.shelterId === s.id, 403, 'You can only remove your own shelter\'s pets.');
    need(d.adoption.availability[pet.id]?.status !== 'pending', 409, 'Decide the open application before removing this pet.');
    d.pet.pets = d.pet.pets.filter((x) => x.id !== pet.id);
    return { status: 204, data: null };
  }],

  // ----- shelter-service -----
  ['GET', '/shelters', 'shelter', ({ claims, query }) => {
    let list = db().shelter.shelters;
    if (query.status === 'pending' || query.status === 'all') {
      requireRole(claims, 'admin');
      if (query.status === 'pending') list = list.filter((s) => s.status === 'pending');
    } else {
      list = list.filter((s) => s.status === 'approved');
    }
    return { data: list };
  }],
  ['GET', '/shelters/:id', 'shelter', ({ params }) => {
    const s = shelterById(params.id);
    need(s, 404, 'Shelter not found.');
    return { data: s };
  }],
  ['PUT', '/shelters/:id', 'shelter', ({ claims, params, body }) => {
    requireRole(claims, 'staff');
    need(claims.shelter_id === params.id, 403, 'You can only edit your own shelter.');
    const s = shelterById(params.id);
    for (const k of ['name', 'district', 'address', 'phone', 'email', 'about']) if (k in body) s[k] = body[k];
    return { data: s };
  }],
  ['PATCH', '/shelters/:id/approval', 'shelter', ({ claims, params, body }) => {
    requireRole(claims, 'admin');
    const s = shelterById(params.id);
    need(s, 404, 'Shelter not found.');
    need(['approved', 'rejected'].includes(body.status), 400, 'Status must be approved or rejected.');
    s.status = body.status;
    return { data: s };
  }],

  // ----- favorites-service -----
  ['GET', '/favorites', 'favorites', ({ claims }) => {
    need(claims, 401, 'Log in to see your saved pets.');
    return { data: db().favorites.byUser[claims.sub] || [] };
  }],
  ['POST', '/favorites', 'favorites', ({ claims, body }) => {
    need(claims, 401, 'Log in to save pets.');
    const list = (db().favorites.byUser[claims.sub] ||= []);
    if (!list.includes(body.petId)) list.push(body.petId);
    return { status: 201, data: list };
  }],
  ['DELETE', '/favorites/:petId', 'favorites', ({ claims, params }) => {
    need(claims, 401, 'Log in to continue.');
    const d = db();
    d.favorites.byUser[claims.sub] = (d.favorites.byUser[claims.sub] || []).filter((id) => id !== params.petId);
    return { data: d.favorites.byUser[claims.sub] };
  }],

  // ----- adoption-service (hot path) -----
  ['GET', '/adoptions/availability/:petId', 'adoption', ({ params }) => {
    return { data: db().adoption.availability[params.petId] || { petId: params.petId, status: 'available' } };
  }],
  ['POST', '/adoptions', 'adoption', ({ claims, body }) => {
    requireRole(claims, 'adopter');
    const d = db();
    const pet = d.pet.pets.find((p) => p.id === body.petId);
    need(pet, 404, 'This pet is no longer listed.');
    need(String(body.message || '').trim().length >= 20, 400, 'Tell the shelter a little more about your home (at least 20 characters).');
    // THE ONE-WINNER RULE. In PostgreSQL this is a single conditional update:
    //   UPDATE availability SET status='pending' WHERE pet_id=$1 AND status='available';
    // 1 row changed -> this adopter wins; 0 rows -> someone else got there first.
    const av = d.adoption.availability[pet.id];
    if (!av || av.status !== 'available') {
      return { status: 409, data: { error: 'Someone else has already applied for this pet.', code: 'PET_TAKEN' } };
    }
    const app = { id: uid('app'), petId: pet.id, shelterId: pet.shelterId, userId: claims.sub, status: 'submitted', message: body.message.trim(), homeType: body.homeType || '', hasYard: !!body.hasYard, otherPets: body.otherPets || '', experience: body.experience || '', createdAt: new Date().toISOString(), decidedAt: null, decisionNote: '' };
    av.status = 'pending';
    av.applicationId = app.id;
    d.adoption.applications.push(app);
    return { status: 201, data: app };
  }],
  ['GET', '/adoptions/mine', 'adoption', ({ claims }) => {
    need(claims, 401, 'Log in to see your applications.');
    const d = db();
    return { data: d.adoption.applications.filter((a) => a.userId === claims.sub).map((a) => ({ ...a, pet: petViewById(a.petId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }],
  ['GET', '/adoptions/shelter', 'adoption', ({ claims }) => {
    const s = staffShelter(claims);
    return { data: db().adoption.applications.filter((a) => a.shelterId === s.id).map((a) => ({ ...a, pet: petViewById(a.petId), applicant: { ...profileOf(a.userId), email: userById(a.userId)?.email } })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }],
  ['POST', '/adoptions/:id/decision', 'adoption', ({ claims, params, body }) => {
    const s = staffShelter(claims);
    const d = db();
    const app = d.adoption.applications.find((a) => a.id === params.id);
    need(app, 404, 'Application not found.');
    need(app.shelterId === s.id, 403, 'This application belongs to another shelter.');
    need(app.status === 'submitted', 409, 'This application has already been decided.');
    need(['approved', 'rejected'].includes(body.decision), 400, 'Choose approve or reject.');
    app.status = body.decision;
    app.decidedAt = new Date().toISOString();
    app.decisionNote = body.note || '';
    d.adoption.availability[app.petId] = body.decision === 'approved'
      ? { petId: app.petId, status: 'adopted', applicationId: app.id }
      : { petId: app.petId, status: 'available', applicationId: null };
    const pet = d.pet.pets.find((p) => p.id === app.petId);
    publish('application.decided', { applicationId: app.id, petId: app.petId, petName: pet?.name || 'your pet', shelterId: app.shelterId, userId: app.userId, userEmail: userById(app.userId)?.email, decision: body.decision, note: app.decisionNote });
    return { data: app };
  }],

  // ----- review-service -----
  ['GET', '/reviews', 'review', ({ query }) => {
    const list = db().review.reviews.filter((r) => !query.shelterId || r.shelterId === query.shelterId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const avg = list.length ? list.reduce((t, r) => t + r.rating, 0) / list.length : 0;
    return { data: { average: Math.round(avg * 10) / 10, count: list.length, items: list } };
  }],
  ['POST', '/reviews', 'review', ({ claims, body }) => {
    requireRole(claims, 'adopter');
    const rating = Number(body.rating);
    need(rating >= 1 && rating <= 5, 400, 'Choose a rating from 1 to 5 stars.');
    need(String(body.comment || '').trim().length >= 5, 400, 'Write a short comment.');
    need(shelterById(body.shelterId), 404, 'Shelter not found.');
    const name = profileOf(claims.sub).name || 'Adopter';
    const parts = name.split(' ');
    const r = { id: uid('rv'), shelterId: body.shelterId, userId: claims.sub, authorName: parts[0] + (parts[1] ? ` ${parts[1][0]}.` : ''), rating, comment: body.comment.trim(), createdAt: new Date().toISOString() };
    db().review.reviews.push(r);
    return { status: 201, data: r };
  }],

  // ----- history-service -----
  ['GET', '/history', 'history', ({ claims }) => {
    need(claims, 401, 'Log in to see your history.');
    return { data: db().history.entries.filter((h) => h.userId === claims.sub).map((h) => ({ ...h, shelterName: shelterById(h.shelterId)?.name || '' })) };
  }],

  // ----- notification-service -----
  ['GET', '/notifications', 'notification', ({ claims }) => {
    need(claims, 401, 'Log in to see notifications.');
    const items = db().notification.items.filter((n) => n.userId === claims.sub);
    return { data: { unread: items.filter((n) => !n.read).length, items } };
  }],
  ['POST', '/notifications/:id/read', 'notification', ({ claims, params }) => {
    need(claims, 401, 'Log in to continue.');
    const n = db().notification.items.find((x) => x.id === params.id && x.userId === claims.sub);
    if (n) n.read = true;
    return { data: n || null };
  }],
  ['POST', '/notifications/read-all', 'notification', ({ claims }) => {
    need(claims, 401, 'Log in to continue.');
    for (const n of db().notification.items) if (n.userId === claims.sub) n.read = true;
    return { data: { unread: 0 } };
  }],

  // ----- reporting-service -----
  ['GET', '/reports/summary', 'reporting', ({ claims }) => {
    requireRole(claims, 'staff', 'admin');
    const d = db();
    const shelterId = claims.role === 'staff' ? claims.shelter_id : null;
    const pets = d.pet.pets.filter((p) => !shelterId || p.shelterId === shelterId);
    const apps = d.adoption.applications.filter((a) => !shelterId || a.shelterId === shelterId);
    const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
    const decidedApps = apps.filter((a) => a.decidedAt);
    const avgDays = decidedApps.length ? decidedApps.reduce((t, a) => t + (new Date(a.decidedAt) - new Date(a.createdAt)), 0) / decidedApps.length / 86400000 : 0;
    return { data: {
      scope: shelterId ? shelterById(shelterId)?.name : 'All shelters',
      pets: { total: pets.length, byStatus: count(pets, (p) => d.adoption.availability[p.id]?.status || 'available'), bySpecies: count(pets, (p) => p.species) },
      applications: { total: apps.length, byStatus: count(apps, (a) => a.status), averageDecisionDays: Math.round(avgDays * 10) / 10 },
      shelters: shelterId ? undefined : count(d.shelter.shelters, (s) => s.status),
      emailsSent: d.email.outbox.length,
    } };
  }],

  // ----- email-worker has no public API. This mock-only route plays the part of Mailpit's inbox. -----
  ['GET', '/_mock/outbox', 'email-worker', ({ claims }) => {
    requireRole(claims, 'admin');
    return { data: db().email.outbox };
  }],
];

function petViewById(id) {
  const p = db().pet.pets.find((x) => x.id === id);
  return p ? petView(p) : { id, name: 'Removed pet', species: 'dog', breed: '', ageMonths: 0, sex: '', status: 'adopted' };
}
function validatePet(b) {
  need(String(b.name || '').trim(), 400, 'Enter the pet\'s name.');
  need(['dog', 'cat', 'rabbit', 'bird'].includes(b.species), 400, 'Choose a species.');
  need(Number(b.ageMonths) >= 0 && Number(b.ageMonths) < 360, 400, 'Enter an age in months between 0 and 359.');
  need(['male', 'female'].includes(b.sex), 400, 'Choose male or female.');
  need(String(b.description || '').trim().length >= 20, 400, 'Write a description of at least 20 characters.');
}
function pickPet(b) {
  return {
    name: b.name.trim(), species: b.species, breed: (b.breed || 'Mixed').trim(), sex: b.sex, ageMonths: Number(b.ageMonths),
    size: b.size || 'medium', coat: b.coat || '#8a6b4e', description: b.description.trim(), vaccinated: !!b.vaccinated,
    neutered: !!b.neutered, goodWith: Array.isArray(b.goodWith) ? b.goodWith : [], imageUrl: (b.imageUrl || '').trim(),
  };
}

function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Acts as the api-gateway: verify token once, find the service, call it. */
export async function mockRequest(method, fullPath, body, token) {
  await new Promise((r) => setTimeout(r, 90 + Math.random() * 160)); // network-ish latency
  const [path, qs = ''] = fullPath.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const claims = readToken(token);
  for (const [m, pattern, service, handler] of routes) {
    if (m !== method) continue;
    const params = match(pattern, path);
    if (!params) continue;
    try {
      const out = handler({ params, query, body: body || {}, claims });
      save();
      return { status: out.status || 200, data: out.data, service };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, data: { error: err.message }, service };
      console.error(err);
      return { status: 500, data: { error: 'The service failed. Try again.' }, service };
    }
  }
  return { status: 404, data: { error: `No route for ${method} ${path}` }, service: 'api-gateway' };
}
