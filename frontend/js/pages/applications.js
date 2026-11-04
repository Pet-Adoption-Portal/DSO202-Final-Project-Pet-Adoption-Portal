// My applications. Data: adoption-service (current applications) and history-service (past outcomes).
// Two tabs so it is obvious which service each list comes from.
import { api } from '../api.js';
import { esc, petArt, statusBadge, formatDate, emptyState, $$ } from '../ui.js';

export default async function applications({ main, query }) {
  const [apps, history] = await Promise.all([api.get('/adoptions/mine'), api.get('/history')]);
  const tab = query.tab === 'history' ? 'history' : 'current';

  const appsHtml = apps.length ? `<ul class="list">${apps.map((a) => `
    <li>
      <div class="thumb">${petArt(a.pet)}</div>
      <div class="grow">
        <strong><a href="#/pets/${esc(a.petId)}">${esc(a.pet.name)}</a></strong> at ${esc(a.pet.shelterName)}
        <p class="muted small">Sent ${esc(formatDate(a.createdAt))}${a.decidedAt ? `, decided ${esc(formatDate(a.decidedAt))}` : ''}</p>
        ${a.decisionNote ? `<p class="small">Shelter's note: ${esc(a.decisionNote)}</p>` : ''}
      </div>
      ${statusBadge(a.status)}
    </li>`).join('')}</ul>`
    : emptyState('No applications yet', 'When you apply for a pet it shows up here with its status.', '<a class="btn btn-primary" href="#/pets">Find a pet</a>');

  const histHtml = history.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Pet</th><th>Shelter</th><th>Outcome</th><th>Date</th><th></th></tr></thead>
      <tbody>${history.map((h) => `<tr>
        <td><a href="#/pets/${esc(h.petId)}">${esc(h.petName)}</a></td><td>${esc(h.shelterName)}</td><td>${statusBadge(h.outcome)}</td><td>${esc(formatDate(h.at))}</td>
        <td>${h.outcome === 'approved' ? `<a href="#/shelters/${esc(h.shelterId)}?review=1">Review shelter</a>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>`
    : emptyState('No past adoptions', 'Decided applications are recorded here.');

  main.innerHTML = `<div class="wrap wrap-mid">
    <div class="page-head"><div><h1>My applications</h1></div></div>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="current" aria-selected="${tab === 'current'}">Current (${apps.filter((a) => a.status === 'submitted').length} in review)</button>
      <button role="tab" data-tab="history" aria-selected="${tab === 'history'}">History (${history.length})</button>
    </div>
    <div role="tabpanel">${tab === 'current' ? appsHtml : histHtml}</div>
  </div>`;

  for (const b of $$('[data-tab]', main)) b.addEventListener('click', () => { location.hash = `#/applications?tab=${b.dataset.tab}`; });
}
