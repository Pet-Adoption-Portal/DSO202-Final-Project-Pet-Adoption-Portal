// Shelter directory. Data: shelter-service, review-service (ratings), search-service (pet counts).
import { api } from '../api.js';
import { esc, stars } from '../ui.js';

const COLORS = ['#2d5fa6', '#c23b2e', '#2f7a4c', '#e3a82b'];

export default async function shelters({ main }) {
  const list = await api.get('/shelters');
  const extra = await Promise.all(list.map((s) => Promise.all([
    api.get(`/reviews?shelterId=${encodeURIComponent(s.id)}`),
    api.get(`/search?shelterId=${encodeURIComponent(s.id)}&limit=1`),
  ])));

  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Shelters</h1><p class="muted">Registered shelters approved by the portal admin.</p></div></div>
    <div class="grid">${list.map((s, i) => {
      const [rv, pets] = extra[i];
      return `<article class="shelter-card">
        <div class="bar" style="background:${COLORS[i % COLORS.length]}"></div>
        <h3><a href="#/shelters/${esc(s.id)}">${esc(s.name)}</a></h3>
        <p class="muted small" style="margin:0">${esc(s.address)}</p>
        <p style="margin:6px 0 0">${stars(rv.average)} <span class="muted small">${rv.count ? `${rv.average} (${rv.count})` : 'No reviews yet'}</span></p>
        <p class="small" style="margin:0">${pets.total} pet${pets.total === 1 ? '' : 's'} available</p>
      </article>`;
    }).join('')}</div>
  </div>`;
}
