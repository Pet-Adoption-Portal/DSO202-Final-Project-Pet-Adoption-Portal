// List a new pet or edit one. Data: pet-service (POST /pets publishes pet.created; PUT /pets/:id).
import { api } from '../api.js';
import { esc, petArt, toast, $ } from '../ui.js';

const COATS = [['#b07a45', 'Tan'], ['#3a3330', 'Black'], ['#f4f1ea', 'White'], ['#e1b57a', 'Golden'], ['#9c7b55', 'Brown tabby'], ['#d9d2c5', 'Grey'], ['#c98b4c', 'Ginger'], ['#7fbf6a', 'Green'], ['#5a3b26', 'Dark brown']];

export default async function petForm({ main, params }) {
  const editing = !!params.id;
  const pet = editing ? await api.get(`/pets/${encodeURIComponent(params.id)}`) : {
    name: '', species: 'dog', breed: '', sex: 'female', ageMonths: 12, size: 'medium', coat: COATS[0][0],
    description: '', vaccinated: true, neutered: false, goodWith: ['adults'], imageUrl: '',
  };
  const opt = (field, v, label) => `<option value="${v}"${pet[field] === v ? ' selected' : ''}>${label}</option>`;
  const gw = (v, label) => `<label><input type="checkbox" name="goodWith" value="${v}"${pet.goodWith?.includes(v) ? ' checked' : ''}> ${label}</label>`;

  main.innerHTML = `<div class="wrap wrap-mid">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/staff?tab=pets">Dashboard</a> / ${editing ? `Edit ${esc(pet.name)}` : 'List a pet'}</nav>
    <div class="page-head"><div><h1>${editing ? `Edit ${esc(pet.name)}` : 'List a pet'}</h1><p class="muted">Adopters see this listing exactly as you write it.</p></div></div>
    <form class="panel" id="petForm" novalidate>
      <p class="form-error" id="err"></p>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:24px;align-items:start" class="pf-grid">
        <div>
          <div class="row">
            <div class="field"><label for="name">Name</label><input id="name" name="name" value="${esc(pet.name)}" required></div>
            <div class="field"><label for="species">Animal</label><select id="species" name="species">${opt('species', 'dog', 'Dog')}${opt('species', 'cat', 'Cat')}${opt('species', 'rabbit', 'Rabbit')}${opt('species', 'bird', 'Bird')}</select></div>
          </div>
          <div class="row">
            <div class="field"><label for="breed">Breed</label><input id="breed" name="breed" value="${esc(pet.breed)}" placeholder="For example: Bhutanese mix"></div>
            <div class="field"><label for="coat">Coat colour</label><select id="coat" name="coat">${COATS.map(([v, l]) => opt('coat', v, l)).join('')}</select></div>
          </div>
          <div class="row">
            <div class="field"><label for="sex">Sex</label><select id="sex" name="sex">${opt('sex', 'female', 'Female')}${opt('sex', 'male', 'Male')}</select></div>
            <div class="field"><label for="ageMonths">Age in months</label><input id="ageMonths" name="ageMonths" type="number" min="0" max="359" value="${esc(pet.ageMonths)}"></div>
            <div class="field"><label for="size">Size</label><select id="size" name="size">${opt('size', 'small', 'Small')}${opt('size', 'medium', 'Medium')}${opt('size', 'large', 'Large')}</select></div>
          </div>
        </div>
        <div><span class="label" style="font-weight:700">Preview</span><div id="preview" style="border-radius:12px;overflow:hidden;margin-top:6px;border:1px solid var(--line)">${petArt(pet)}</div></div>
      </div>
      <div class="field"><label for="description">Description</label><textarea id="description" name="description" placeholder="Personality, routine, health notes and the kind of home that suits them.">${esc(pet.description)}</textarea><span class="hint">At least 20 characters.</span></div>
      <div class="field"><label for="imageUrl">Photo URL (optional)</label><input id="imageUrl" name="imageUrl" type="url" value="${esc(pet.imageUrl)}" placeholder="https://"><span class="hint">Without a photo, the listing shows a drawing in the coat colour.</span></div>
      <div class="field"><span class="label">Health</span><div class="checks">
        <label><input type="checkbox" name="vaccinated"${pet.vaccinated ? ' checked' : ''}> Vaccinated</label>
        <label><input type="checkbox" name="neutered"${pet.neutered ? ' checked' : ''}> Neutered or spayed</label></div></div>
      <div class="field"><span class="label">Good with</span><div class="checks">${gw('adults', 'Adults')}${gw('children', 'Children')}${gw('dogs', 'Other dogs')}${gw('cats', 'Cats')}</div></div>
      <div class="actions"><button class="btn btn-primary" type="submit">${editing ? 'Save changes' : 'Publish listing'}</button><a class="btn btn-quiet" href="#/staff?tab=pets">Cancel</a></div>
    </form>
  </div>
  <style>@media (max-width:620px){.pf-grid{grid-template-columns:1fr !important}}</style>`;

  const form = $('#petForm', main);
  const read = () => {
    const f = new FormData(form);
    return {
      name: f.get('name'), species: f.get('species'), breed: f.get('breed'), coat: f.get('coat'), sex: f.get('sex'),
      ageMonths: Number(f.get('ageMonths')), size: f.get('size'), description: f.get('description'), imageUrl: f.get('imageUrl'),
      vaccinated: f.get('vaccinated') === 'on', neutered: f.get('neutered') === 'on', goodWith: f.getAll('goodWith'),
    };
  };
  form.addEventListener('input', () => { const b = read(); $('#preview', main).innerHTML = petArt({ ...b, id: pet.id || b.name, name: b.name || 'New pet' }); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const saved = editing ? await api.put(`/pets/${encodeURIComponent(pet.id)}`, read()) : await api.post('/pets', read());
      toast(editing ? 'Changes saved' : `${saved.name} is now listed`);
      location.hash = `#/pets/${saved.id}`;
    } catch (ex) { $('#err', main).textContent = ex.message; window.scrollTo(0, 0); }
  });
}
