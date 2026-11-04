// Shelter staff dashboard. Data: adoption-service (applications + decisions), pet-service (listings),
// shelter-service (approval state). Deciding an application publishes application.decided,
// which notification, history and reporting consume.
import { api } from '../api.js';
import { currentUser } from '../auth.js';
import { esc, petArt, statusBadge, formatDate, formatAge, emptyState, toast, $, $$ } from '../ui.js';

export default async function staff({ main, query, rerender }) {
  const u = currentUser();
  const shelter = await api.get(`/shelters/${encodeURIComponent(u.shelterId)}`);

  if (shelter.status !== 'approved') {
    main.innerHTML = `<div class="wrap wrap-mid">
      <div class="page-head"><div><h1>${esc(shelter.name)}</h1></div></div>
      <div class="notice ${shelter.status === 'rejected' ? 'notice-bad' : 'notice-warn'}">
        <strong>${shelter.status === 'rejected' ? 'Your shelter registration was not approved.' : 'Your shelter is waiting for approval.'}</strong>
        ${shelter.status === 'rejected' ? 'Contact the portal admin for details.' : 'An admin checks every new shelter. You can list pets as soon as it is approved.'}
      </div>
      <a class="btn btn-outline" href="#/profile">Complete your shelter details</a>
    </div>`;
    return;
  }

  const [apps, pets] = await Promise.all([api.get('/adoptions/shelter'), api.get(`/pets?shelterId=${encodeURIComponent(shelter.id)}`)]);
  const open = apps.filter((a) => a.status === 'submitted');
  const tab = query.tab === 'pets' ? 'pets' : 'apps';

  const appsHtml = apps.length ? `<ul class="list">${apps.map((a) => `
    <li style="align-items:flex-start">
      <div class="thumb">${petArt(a.pet)}</div>
      <div class="grow">
        <strong>${esc(a.applicant.name || a.applicant.email)}</strong> wants to adopt <a href="#/pets/${esc(a.petId)}">${esc(a.pet.name)}</a>
        <p class="muted small">${esc(a.applicant.email)}${a.applicant.phone ? ', ' + esc(a.applicant.phone) : ''}. Sent ${esc(formatDate(a.createdAt))}.</p>
        <p class="small">Home: ${esc(a.homeType || 'not given')}${a.hasYard ? ' with a yard' : ''}. Other pets: ${esc(a.otherPets || 'none')}. Experience: ${esc(a.experience || 'not given')}.</p>
        <p style="margin-top:6px">${esc(a.message)}</p>
        ${a.status === 'submitted' ? `<form class="decide" data-id="${esc(a.id)}" style="margin-top:10px">
            <div class="field" style="margin-bottom:10px"><label for="note-${esc(a.id)}">Note to the adopter (optional)</label><input id="note-${esc(a.id)}" name="note" type="text" placeholder="For example: please visit on Saturday at 10am"></div>
            <div class="actions"><button class="btn btn-primary btn-small" name="decision" value="approved">Approve</button><button class="btn btn-danger btn-small" name="decision" value="rejected">Reject</button></div>
          </form>` : (a.decisionNote ? `<p class="muted small">Your note: ${esc(a.decisionNote)}</p>` : '')}
      </div>
      ${statusBadge(a.status)}
    </li>`).join('')}</ul>`
    : emptyState('No applications yet', 'Applications for your pets will appear here.');

  const petsHtml = pets.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Pet</th><th>Details</th><th>Status</th><th>Listed</th><th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${pets.map((p) => `<tr>
        <td><div style="display:flex;gap:12px;align-items:center"><div style="width:56px;border-radius:6px;overflow:hidden">${petArt(p)}</div><a href="#/pets/${esc(p.id)}"><strong>${esc(p.name)}</strong></a></div></td>
        <td class="small">${esc(p.species)}, ${esc(p.breed)}, ${esc(formatAge(p.ageMonths))}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="small">${esc(formatDate(p.createdAt))}</td>
        <td style="white-space:nowrap"><a class="btn btn-quiet btn-small" href="#/staff/pets/${esc(p.id)}/edit">Edit</a><button class="btn btn-quiet btn-small" data-del="${esc(p.id)}" data-name="${esc(p.name)}">Remove</button></td>
      </tr>`).join('')}</tbody></table></div>`
    : emptyState('No pets listed', 'List your first animal so adopters can find it.', '<a class="btn btn-primary" href="#/staff/pets/new">List a pet</a>');

  main.innerHTML = `<div class="wrap">
    <div class="page-head">
      <div><h1>${esc(shelter.name)}</h1><p class="muted">${open.length} application${open.length === 1 ? '' : 's'} waiting for a decision, ${pets.length} pet${pets.length === 1 ? '' : 's'} listed.</p></div>
      <a class="btn btn-primary" href="#/staff/pets/new">List a pet</a>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="apps" aria-selected="${tab === 'apps'}">Applications (${open.length} open)</button>
      <button role="tab" data-tab="pets" aria-selected="${tab === 'pets'}">Our pets (${pets.length})</button>
    </div>
    <div role="tabpanel">${tab === 'apps' ? appsHtml : petsHtml}</div>
  </div>`;

  for (const b of $$('[data-tab]', main)) b.addEventListener('click', () => { location.hash = `#/staff?tab=${b.dataset.tab}`; });

  for (const form of $$('form.decide', main)) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const decision = e.submitter?.value;
      if (decision === 'rejected' && !confirm('Reject this application? The pet becomes available to other adopters.')) return;
      $$('button', form).forEach((b) => { b.disabled = true; });
      try {
        await api.post(`/adoptions/${encodeURIComponent(form.dataset.id)}/decision`, { decision, note: form.note.value });
        toast(decision === 'approved' ? 'Application approved. The adopter has been notified.' : 'Application rejected. The pet is available again.');
        rerender();
      } catch (ex) { toast(ex.message, 'bad'); $$('button', form).forEach((b) => { b.disabled = false; }); }
    });
  }

  for (const b of $$('[data-del]', main)) {
    b.addEventListener('click', async () => {
      if (!confirm(`Remove ${b.dataset.name} from the portal? This cannot be undone.`)) return;
      try { await api.del(`/pets/${encodeURIComponent(b.dataset.del)}`); toast(`${b.dataset.name} removed`); rerender(); }
      catch (ex) { toast(ex.message, 'bad'); }
    });
  }
}
