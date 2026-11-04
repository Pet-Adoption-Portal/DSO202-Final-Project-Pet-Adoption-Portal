// Adoption application. Data: pet-service, profile-service (prefill), adoption-service (POST).
// A 409 PET_TAKEN response is the "someone else won" outcome of the one-winner rule (experiment E2).
import { api } from '../api.js';
import { esc, petArt, $ } from '../ui.js';

export default async function apply({ main, params }) {
  const [pet, profile, availability] = await Promise.all([
    api.get(`/pets/${encodeURIComponent(params.id)}`),
    api.get('/profile'),
    api.get(`/adoptions/availability/${encodeURIComponent(params.id)}`),
  ]);

  if (availability.status !== 'available') {
    main.innerHTML = resultHtml(false, pet);
    return;
  }

  const sel = (v) => (profile.homeType === v ? ' selected' : '');
  main.innerHTML = `<div class="wrap wrap-mid">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/pets">Find a pet</a> / <a href="#/pets/${esc(pet.id)}">${esc(pet.name)}</a> / Apply</nav>
    <div class="page-head">
      <div style="display:flex;gap:18px;align-items:center">
        <div style="width:110px;border-radius:12px;overflow:hidden;flex:none">${petArt(pet)}</div>
        <div><h1>Apply to adopt ${esc(pet.name)}</h1><p class="muted">${esc(pet.shelterName)} reads every application. Answer honestly; there are no wrong answers.</p></div>
      </div>
    </div>
    <form class="panel" id="applyForm" novalidate>
      <p class="form-error" id="err"></p>
      <div class="row">
        <div class="field"><label for="homeType">Your home</label>
          <select id="homeType" name="homeType" required>
            <option value="">Choose one</option>
            <option value="house"${sel('house')}>House</option>
            <option value="apartment"${sel('apartment')}>Apartment or flat</option>
            <option value="farm"${sel('farm')}>Farm or village home</option>
          </select></div>
        <div class="field"><span class="label">Outdoor space</span>
          <div class="checks"><label><input type="checkbox" name="hasYard"${profile.hasYard ? ' checked' : ''}> I have a fenced yard or garden</label></div></div>
      </div>
      <div class="field"><label for="otherPets">Other pets at home</label><input id="otherPets" name="otherPets" type="text" value="${esc(profile.otherPets || '')}" placeholder="For example: one cat, 4 years old"></div>
      <div class="field"><label for="experience">Experience with pets</label><input id="experience" name="experience" type="text" placeholder="For example: grew up with dogs"></div>
      <div class="field"><label for="message">Why ${esc(pet.name)}?</label>
        <textarea id="message" name="message" required minlength="20" placeholder="Tell the shelter about your daily routine and who lives with you."></textarea>
        <span class="hint">At least 20 characters.</span></div>
      <div class="actions"><button class="btn btn-primary" type="submit" id="submitBtn">Send application</button><a class="btn btn-quiet" href="#/pets/${esc(pet.id)}">Cancel</a></div>
    </form>
  </div>`;

  $('#applyForm', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = $('#err', main);
    err.textContent = '';
    if (!f.get('homeType')) { err.textContent = 'Choose the type of home you live in.'; return; }
    const btn = $('#submitBtn', main);
    btn.disabled = true;
    btn.textContent = 'Sending';
    try {
      await api.post('/adoptions', {
        petId: pet.id, homeType: f.get('homeType'), hasYard: f.get('hasYard') === 'on',
        otherPets: f.get('otherPets'), experience: f.get('experience'), message: f.get('message'),
      });
      main.innerHTML = resultHtml(true, pet);
    } catch (ex) {
      if (ex.status === 409) { main.innerHTML = resultHtml(false, pet); return; }
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Send application';
    }
  });
}

function resultHtml(won, pet) {
  return won
    ? `<div class="wrap wrap-narrow"><div class="panel result result-win">
        <div class="mark" aria-hidden="true">✓</div>
        <h1>Application sent</h1>
        <p>${esc(pet.name)} is now reserved for you while ${esc(pet.shelterName)} reviews your application. You will get a notification and an email when they decide.</p>
        <div class="actions" style="justify-content:center"><a class="btn btn-primary" href="#/applications">View my applications</a><a class="btn btn-outline" href="#/pets">Keep browsing</a></div>
      </div></div>`
    : `<div class="wrap wrap-narrow"><div class="panel result result-lose">
        <div class="mark" aria-hidden="true">!</div>
        <h1>${esc(pet.name)} already has an application</h1>
        <p>Another adopter applied first. If their application is not approved, ${esc(pet.name)} becomes available again. Save ${esc(pet.name)} to check back later.</p>
        <div class="actions" style="justify-content:center"><a class="btn btn-primary" href="#/pets">See other pets</a><a class="btn btn-outline" href="#/pets/${esc(pet.id)}">Back to ${esc(pet.name)}</a></div>
      </div></div>`;
}
