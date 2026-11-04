// Admin. Data: shelter-service (approve shelters), email-worker outbox (mock stand-in for Mailpit).
import { api, config } from '../api.js';
import { esc, formatDate, statusBadge, emptyState, timeAgo, toast, $, $$ } from '../ui.js';
import { resetDb } from '../mock/db.js';

export default async function admin({ main, rerender }) {
  const [all, outbox] = await Promise.all([
    api.get('/shelters?status=all'),
    config.apiMode === 'mock' ? api.get('/_mock/outbox') : Promise.resolve(null),
  ]);
  const pending = all.filter((s) => s.status === 'pending');

  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Admin</h1><p class="muted">${pending.length} shelter${pending.length === 1 ? '' : 's'} waiting for approval.</p></div></div>

    <section>
      <div class="section-head"><h2>Shelter registrations</h2></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Shelter</th><th>District</th><th>Contact</th><th>Registered</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${all.map((s) => `<tr>
          <td><strong>${esc(s.name)}</strong></td><td>${esc(s.district)}</td><td class="small">${esc(s.email)}</td>
          <td class="small">${esc(formatDate(s.createdAt))}</td><td>${statusBadge(s.status === 'pending' ? 'submitted' : s.status)}</td>
          <td style="white-space:nowrap">${s.status === 'pending'
            ? `<button class="btn btn-primary btn-small" data-approve="${esc(s.id)}" data-status="approved">Approve</button> <button class="btn btn-danger btn-small" data-approve="${esc(s.id)}" data-status="rejected">Reject</button>`
            : `<a class="btn btn-quiet btn-small" href="#/shelters/${esc(s.id)}">View</a>`}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>

    ${outbox ? `<section class="section">
      <div class="section-head"><h2>Email outbox</h2><span class="muted small">Sent by email-worker. In the cluster, Mailpit catches these.</span></div>
      ${outbox.length ? `<ul class="list">${outbox.map((m) => `<li><div class="grow"><strong>${esc(m.subject)}</strong><p class="muted small">To ${esc(m.to)}, ${esc(timeAgo(m.sentAt))}</p>${m.body ? `<p class="small">${esc(m.body)}</p>` : ''}</div></li>`).join('')}</ul>`
        : emptyState('No emails sent yet', 'Emails go out when shelter staff decide on applications.')}
    </section>

    <section class="section">
      <div class="section-head"><h2>Demo data</h2></div>
      <div class="panel"><p>Mock mode keeps all data in this browser. Resetting restores the original shelters, pets and accounts.</p>
        <button class="btn btn-danger" id="reset" type="button">Reset demo data</button></div>
    </section>` : ''}
  </div>`;

  for (const b of $$('[data-approve]', main)) {
    b.addEventListener('click', async () => {
      try { await api.patch(`/shelters/${encodeURIComponent(b.dataset.approve)}/approval`, { status: b.dataset.status }); toast(b.dataset.status === 'approved' ? 'Shelter approved' : 'Shelter rejected'); rerender(); }
      catch (ex) { toast(ex.message, 'bad'); }
    });
  }
  $('#reset', main)?.addEventListener('click', () => {
    if (!confirm('Reset all demo data? Accounts you created will be removed.')) return;
    resetDb();
    toast('Demo data reset');
    rerender();
  });
}
