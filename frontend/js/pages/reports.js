// Reports for staff (their shelter) and admin (all shelters). Data: reporting-service.
import { api } from '../api.js';
import { esc } from '../ui.js';

const COLOR = { available: '#2f7a4c', pending: '#e3a82b', adopted: '#2d5fa6', submitted: '#e3a82b', approved: '#2f7a4c', rejected: '#c23b2e', dog: '#2d5fa6', cat: '#c23b2e', rabbit: '#2f7a4c', bird: '#e3a82b' };
const LABEL = { available: 'Available', pending: 'In review', adopted: 'Adopted', submitted: 'In review', approved: 'Approved', rejected: 'Not approved', dog: 'Dogs', cat: 'Cats', rabbit: 'Rabbits', bird: 'Birds' };

function bars(counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return `<div class="bars">${entries.map(([k, v]) => `<div class="bar-row">
    <span>${esc(LABEL[k] || k)}</span>
    <div class="bar-track" role="img" aria-label="${esc(LABEL[k] || k)}: ${v}"><div class="bar-fill" style="width:${(v / max) * 100}%;background:${COLOR[k] || '#1e5b44'}"></div></div>
    <strong>${v}</strong></div>`).join('')}</div>`;
}

export default async function reports({ main }) {
  const r = await api.get('/reports/summary');
  const adopted = r.pets.byStatus.adopted || 0;
  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Reports</h1><p class="muted">${esc(r.scope)}</p></div></div>
    <div class="stats">
      <div class="stat"><div class="n">${r.pets.total}</div><div class="l">Pets listed</div></div>
      <div class="stat"><div class="n">${adopted}</div><div class="l">Adopted</div></div>
      <div class="stat"><div class="n">${r.applications.total}</div><div class="l">Applications received</div></div>
      <div class="stat"><div class="n">${r.applications.averageDecisionDays}</div><div class="l">Days to decide, on average</div></div>
      <div class="stat"><div class="n">${r.emailsSent}</div><div class="l">Emails sent</div></div>
    </div>
    <div class="row" style="margin-top:22px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <div class="panel"><h2 style="font-size:1.2rem">Pets by status</h2>${bars(r.pets.byStatus)}</div>
      <div class="panel" style="margin-top:0"><h2 style="font-size:1.2rem">Pets by animal</h2>${bars(r.pets.bySpecies)}</div>
      <div class="panel" style="margin-top:0"><h2 style="font-size:1.2rem">Applications by outcome</h2>${bars(r.applications.byStatus)}</div>
      ${r.shelters ? `<div class="panel" style="margin-top:0"><h2 style="font-size:1.2rem">Shelters by status</h2>${bars(r.shelters)}</div>` : ''}
    </div>
  </div>`;
}
