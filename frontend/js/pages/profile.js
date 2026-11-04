// Profile. Data: profile-service (GET/PUT /profile). Staff also edit their shelter (shelter-service).
import { api } from '../api.js';
import { currentUser, updateUser } from '../auth.js';
import { esc, toast, $ } from '../ui.js';

export default async function profile({ main }) {
  const u = currentUser();
  const p = await api.get('/profile');
  const shelter = u.role === 'staff' && u.shelterId ? await api.get(`/shelters/${encodeURIComponent(u.shelterId)}`) : null;
  const sel = (v) => (p.homeType === v ? ' selected' : '');

  main.innerHTML = `<div class="wrap wrap-mid">
    <div class="page-head"><div><h1>Your profile</h1><p class="muted">${esc(p.email)}, ${esc(p.role)} account</p></div></div>
    <form class="panel" id="profileForm" novalidate>
      <h2>Personal details</h2>
      <p class="form-error" id="err"></p>
      <div class="row">
        <div class="field"><label for="name">Full name</label><input id="name" name="name" value="${esc(p.name)}" required></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" value="${esc(p.phone)}"></div>
        <div class="field"><label for="district">District</label><input id="district" name="district" value="${esc(p.district)}"></div>
      </div>
      ${u.role === 'adopter' ? `
      <h3 style="margin-top:8px">Your home</h3>
      <p class="muted small">Used to fill in adoption applications for you.</p>
      <div class="row">
        <div class="field"><label for="homeType">Home type</label><select id="homeType" name="homeType"><option value="">Not set</option><option value="house"${sel('house')}>House</option><option value="apartment"${sel('apartment')}>Apartment or flat</option><option value="farm"${sel('farm')}>Farm or village home</option></select></div>
        <div class="field"><label for="otherPets">Other pets</label><input id="otherPets" name="otherPets" value="${esc(p.otherPets)}"></div>
      </div>
      <div class="checks" style="margin-bottom:16px"><label><input type="checkbox" name="hasYard"${p.hasYard ? ' checked' : ''}> I have a fenced yard or garden</label></div>` : ''}
      <button class="btn btn-primary" type="submit">Save profile</button>
    </form>
    ${shelter ? `<form class="panel" id="shelterForm" novalidate>
      <h2>Shelter details</h2>
      <p class="muted small">Status: ${esc(shelter.status)}. Adopters see these details on every listing.</p>
      <div class="row">
        <div class="field"><label for="s-name">Shelter name</label><input id="s-name" name="name" value="${esc(shelter.name)}"></div>
        <div class="field"><label for="s-district">District</label><input id="s-district" name="district" value="${esc(shelter.district)}"></div>
      </div>
      <div class="row">
        <div class="field"><label for="s-address">Address</label><input id="s-address" name="address" value="${esc(shelter.address)}"></div>
        <div class="field"><label for="s-phone">Phone</label><input id="s-phone" name="phone" value="${esc(shelter.phone)}"></div>
        <div class="field"><label for="s-email">Email</label><input id="s-email" name="email" type="email" value="${esc(shelter.email)}"></div>
      </div>
      <div class="field"><label for="s-about">About the shelter</label><textarea id="s-about" name="about">${esc(shelter.about)}</textarea></div>
      <button class="btn btn-primary" type="submit">Save shelter details</button>
    </form>` : ''}
  </div>`;

  $('#profileForm', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get('name'), phone: f.get('phone'), district: f.get('district') };
    if (u.role === 'adopter') Object.assign(body, { homeType: f.get('homeType'), otherPets: f.get('otherPets'), hasYard: f.get('hasYard') === 'on' });
    try {
      await api.put('/profile', body);
      updateUser({ name: body.name });
      $('#err', main).textContent = '';
      toast('Profile saved');
      window.dispatchEvent(new Event('session-changed'));
    } catch (ex) { $('#err', main).textContent = ex.message; }
  });

  $('#shelterForm', main)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api.put(`/shelters/${encodeURIComponent(shelter.id)}`, Object.fromEntries(new FormData(e.target))); toast('Shelter details saved'); }
    catch (ex) { toast(ex.message, 'bad'); }
  });
}
