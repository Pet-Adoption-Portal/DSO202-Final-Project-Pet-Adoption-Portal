// Notifications. Data: notification-service (built from application.decided events).
import { api } from '../api.js';
import { esc, timeAgo, emptyState, $, $$ } from '../ui.js';

export default async function notifications({ main, rerender }) {
  const { unread, items } = await api.get('/notifications');

  main.innerHTML = `<div class="wrap wrap-mid">
    <div class="page-head">
      <div><h1>Notifications</h1><p class="muted">${unread ? `${unread} unread` : 'You are all caught up.'}</p></div>
      ${unread ? '<button class="btn btn-outline btn-small" id="readAll" type="button">Mark all as read</button>' : ''}
    </div>
    ${items.length ? `<ul class="list">${items.map((n) => `
      <li class="${n.read ? '' : 'unread'}">
        <div class="grow">
          <strong>${esc(n.title)}</strong>
          <p class="muted small">${esc(n.body)}</p>
          <p class="muted small">${esc(timeAgo(n.createdAt))}</p>
        </div>
        <a class="btn btn-quiet btn-small" href="${esc(n.link || '#/')}" data-read="${esc(n.id)}">Open</a>
      </li>`).join('')}</ul>`
    : emptyState('No notifications', 'When a shelter decides on your application, you will hear about it here.')}
  </div>`;

  $('#readAll', main)?.addEventListener('click', async () => { await api.post('/notifications/read-all'); rerender(); });
  for (const a of $$('[data-read]', main)) a.addEventListener('click', () => { api.post(`/notifications/${encodeURIComponent(a.dataset.read)}/read`).catch(() => {}); });
}
