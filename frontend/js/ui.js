// Small UI helpers shared by every page: escaping, formatting, toasts and pet artwork.

/** Escape a value before putting it into innerHTML. Use it for every user-supplied string. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function toast(message, kind = 'ok') {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (kind === 'bad' ? ' toast-bad' : '');
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

export function formatAge(months) {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} year${y === 1 ? '' : 's'}`;
}

export function ageGroup(months) {
  if (months < 12) return 'young';
  if (months < 84) return 'adult';
  return 'senior';
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
}

export function statusBadge(status) {
  const labels = {
    available: 'Available', pending: 'Application in review', adopted: 'Adopted',
    submitted: 'In review', approved: 'Approved', rejected: 'Not approved',
  };
  return `<span class="status status-${esc(status)}">${esc(labels[status] || status)}</span>`;
}

export function stars(rating) {
  const r = Math.round(rating || 0);
  return `<span class="stars" aria-label="${r} out of 5">${'★'.repeat(r)}<span class="off">${'★'.repeat(5 - r)}</span></span>`;
}

export const heartIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.4 1.1 4.2 2.4h2.8C14.2 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z"/></svg>`;

/* ---------- Pet artwork ----------
   Pets in the mock carry no photos, so each one gets a drawn portrait in its
   coat colour on a prayer-flag-tinted background. A real `imageUrl` from
   pet-service is used instead when present. */
const BG = ['#e4ecf7', '#f8e5e2', '#e2f0e7', '#fbf0d8', '#eef1f0'];

function hash(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export function petArt(pet, { bg } = {}) {
  if (pet.imageUrl) {
    return `<img src="${esc(pet.imageUrl)}" alt="${esc(pet.name)}" style="width:100%;height:100%;object-fit:cover">`;
  }
  const c = pet.coat || '#8a6b4e';
  const back = bg || BG[hash(pet.id || pet.name) % BG.length];
  const eye = '#1c1a17';
  const shapes = {
    dog: `
      <ellipse cx="200" cy="292" rx="96" ry="40" fill="${c}" opacity=".35"/>
      <ellipse cx="130" cy="140" rx="34" ry="62" fill="${c}" transform="rotate(18 130 140)" filter="url(#d)"/>
      <ellipse cx="270" cy="140" rx="34" ry="62" fill="${c}" transform="rotate(-18 270 140)" filter="url(#d)"/>
      <circle cx="200" cy="160" r="82" fill="${c}"/>
      <ellipse cx="200" cy="200" rx="48" ry="36" fill="#f3e6d6"/>
      <ellipse cx="200" cy="184" rx="15" ry="11" fill="${eye}"/>
      <path d="M200 196 v14 M186 214 q14 10 28 0" stroke="${eye}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="168" cy="146" r="9" fill="${eye}"/><circle cx="232" cy="146" r="9" fill="${eye}"/>
      <circle cx="171" cy="143" r="3" fill="#fff"/><circle cx="235" cy="143" r="3" fill="#fff"/>`,
    cat: `
      <ellipse cx="200" cy="292" rx="90" ry="38" fill="${c}" opacity=".35"/>
      <path d="M128 132 L140 54 L192 100 Z" fill="${c}"/><path d="M272 132 L260 54 L208 100 Z" fill="${c}"/>
      <path d="M142 112 L148 76 L174 98 Z" fill="#f2c9c0"/><path d="M258 112 L252 76 L226 98 Z" fill="#f2c9c0"/>
      <ellipse cx="200" cy="166" rx="86" ry="76" fill="${c}"/>
      <ellipse cx="168" cy="156" rx="11" ry="14" fill="#c8d65a"/><ellipse cx="232" cy="156" rx="11" ry="14" fill="#c8d65a"/>
      <ellipse cx="168" cy="157" rx="4" ry="11" fill="${eye}"/><ellipse cx="232" cy="157" rx="4" ry="11" fill="${eye}"/>
      <path d="M192 186 h16 l-8 9 z" fill="#e69a8f"/>
      <path d="M200 195 q-9 12 -20 6 M200 195 q9 12 20 6" stroke="${eye}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M150 190 h-46 M150 198 l-42 10 M250 190 h46 M250 198 l42 10" stroke="${eye}" stroke-width="2" opacity=".55" stroke-linecap="round"/>`,
    rabbit: `
      <ellipse cx="200" cy="294" rx="86" ry="36" fill="${c}" opacity=".35"/>
      <ellipse cx="168" cy="84" rx="22" ry="68" fill="${c}" transform="rotate(-8 168 84)"/>
      <ellipse cx="232" cy="84" rx="22" ry="68" fill="${c}" transform="rotate(8 232 84)"/>
      <ellipse cx="168" cy="88" rx="9" ry="48" fill="#f2c9c0" transform="rotate(-8 168 88)"/>
      <ellipse cx="232" cy="88" rx="9" ry="48" fill="#f2c9c0" transform="rotate(8 232 88)"/>
      <circle cx="200" cy="186" r="76" fill="${c}"/>
      <circle cx="174" cy="176" r="8" fill="${eye}"/><circle cx="226" cy="176" r="8" fill="${eye}"/>
      <circle cx="176" cy="173" r="2.6" fill="#fff"/><circle cx="228" cy="173" r="2.6" fill="#fff"/>
      <ellipse cx="200" cy="202" rx="8" ry="6" fill="#e69a8f"/>
      <path d="M200 208 v8 M190 220 q10 6 20 0" stroke="${eye}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    bird: `
      <path d="M120 270 h160" stroke="#7a5a3a" stroke-width="10" stroke-linecap="round"/>
      <ellipse cx="200" cy="196" rx="74" ry="80" fill="${c}"/>
      <ellipse cx="200" cy="222" rx="46" ry="50" fill="#fff" opacity=".55"/>
      <path d="M150 190 q-34 40 -6 78 q30 -18 32 -60 z" fill="${c}" filter="url(#d)"/>
      <circle cx="182" cy="160" r="9" fill="${eye}"/><circle cx="185" cy="157" r="3" fill="#fff"/>
      <path d="M214 160 l34 10 l-34 12 z" fill="#e3a82b"/>
      <path d="M200 112 q8 -34 26 -30 q-6 18 -18 34 z" fill="${c}"/>
      <path d="M186 272 v-6 M214 272 v-6" stroke="#e3a82b" stroke-width="5" stroke-linecap="round"/>`,
  };
  return `<svg viewBox="0 0 400 300" role="img" aria-label="Drawing of ${esc(pet.name)}, a ${esc(pet.species)}">
    <defs><filter id="d"><feColorMatrix type="matrix" values=".82 0 0 0 0  0 .82 0 0 0  0 0 .82 0 0  0 0 0 1 0"/></filter></defs>
    <rect width="400" height="300" fill="${back}"/>
    <circle cx="330" cy="60" r="90" fill="#fff" opacity=".35"/>
    ${shapes[pet.species] || shapes.dog}
  </svg>`;
}

/** Shared card markup used by home, browse, favourites and shelter pages. */
export function petCard(pet, { isFav = false, showFav = true } = {}) {
  return `<article class="pet-card">
    <div class="art">${petArt(pet)}</div>
    ${showFav ? `<div class="fav"><button class="fav-btn" data-fav="${esc(pet.id)}" aria-pressed="${isFav}" aria-label="${isFav ? 'Remove' : 'Save'} ${esc(pet.name)} ${isFav ? 'from' : 'to'} favourites">${heartIcon}</button></div>` : ''}
    <div class="body">
      ${statusBadge(pet.status || 'available')}
      <h3><a href="#/pets/${esc(pet.id)}">${esc(pet.name)}</a></h3>
      <div class="facts">${esc(pet.breed)}, ${esc(pet.sex)}, ${esc(formatAge(pet.ageMonths))}</div>
      <div class="where">${esc(pet.shelterName || '')}</div>
    </div>
  </article>`;
}

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${actionHtml}</div>`;
}
