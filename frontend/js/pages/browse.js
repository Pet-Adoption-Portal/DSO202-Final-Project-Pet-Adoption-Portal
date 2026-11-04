// Browse/search pets. Data: search-service (GET /search), shelter-service for the filter list.
import { api } from '../api.js';
import { esc, petCard, emptyState, $ } from '../ui.js';
import { isFav, bindFavButtons } from '../favorites.js';

const FILTERS = ['q', 'species', 'age', 'sex', 'size', 'shelterId', 'goodWith', 'status', 'sort'];

export default async function browse({ main, query, isCurrent }) {
  const shelters = await api.get('/shelters');
  const opt = (name, value, label) => `<option value="${value}"${(query[name] || '') === value ? ' selected' : ''}>${label}</option>`;

  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Find a pet</h1><p class="muted">Every animal here is listed by a registered shelter.</p></div></div>
    <div class="browse">
      <form class="filters" id="filters" role="search" aria-label="Filter pets">
        <h2>Filter</h2>
        <div class="field"><label for="f-q">Search</label><input id="f-q" type="search" name="q" value="${esc(query.q || '')}" placeholder="Name, breed, shelter"></div>
        <div class="field"><label for="f-species">Animal</label><select id="f-species" name="species">${opt('species', '', 'Any')}${opt('species', 'dog', 'Dog')}${opt('species', 'cat', 'Cat')}${opt('species', 'rabbit', 'Rabbit')}${opt('species', 'bird', 'Bird')}</select></div>
        <div class="field"><label for="f-age">Age</label><select id="f-age" name="age">${opt('age', '', 'Any age')}${opt('age', 'young', 'Under 1 year')}${opt('age', 'adult', '1 to 7 years')}${opt('age', 'senior', '7 years and over')}</select></div>
        <div class="field"><label for="f-sex">Sex</label><select id="f-sex" name="sex">${opt('sex', '', 'Any')}${opt('sex', 'female', 'Female')}${opt('sex', 'male', 'Male')}</select></div>
        <div class="field"><label for="f-size">Size</label><select id="f-size" name="size">${opt('size', '', 'Any size')}${opt('size', 'small', 'Small')}${opt('size', 'medium', 'Medium')}${opt('size', 'large', 'Large')}</select></div>
        <div class="field"><label for="f-gw">Good with</label><select id="f-gw" name="goodWith">${opt('goodWith', '', 'No preference')}${opt('goodWith', 'children', 'Children')}${opt('goodWith', 'dogs', 'Other dogs')}${opt('goodWith', 'cats', 'Cats')}</select></div>
        <div class="field"><label for="f-shelter">Shelter</label><select id="f-shelter" name="shelterId">${opt('shelterId', '', 'All shelters')}${shelters.map((s) => opt('shelterId', s.id, esc(s.name))).join('')}</select></div>
        <div class="field"><label for="f-status">Show</label><select id="f-status" name="status">${opt('status', '', 'Available now')}${opt('status', 'all', 'All, including adopted')}</select></div>
        <button class="btn btn-outline btn-small" type="button" id="clear">Clear filters</button>
      </form>
      <section aria-live="polite">
        <div class="results-bar">
          <p class="muted" id="count" style="margin:0"></p>
          <label class="small">Sort by
            <select name="sort" id="sort" form="filters">${opt('sort', '', 'Newest')}${opt('sort', 'youngest', 'Youngest')}${opt('sort', 'oldest', 'Oldest')}${opt('sort', 'name', 'Name')}</select>
          </label>
        </div>
        <div id="results"></div>
      </section>
    </div>
  </div>`;

  const form = $('#filters', main);

  async function load() {
    const fd = new FormData(form);
    const qs = new URLSearchParams();
    for (const k of FILTERS) { const v = fd.get(k); if (v) qs.set(k, v); }
    history.replaceState(null, '', `#/pets${qs.toString() ? '?' + qs : ''}`);
    const res = await api.get(`/search?${qs}`);
    if (!isCurrent()) return;
    $('#count', main).textContent = `${res.total} pet${res.total === 1 ? '' : 's'} found`;
    const box = $('#results', main);
    box.innerHTML = res.items.length
      ? `<div class="grid">${res.items.map((p) => petCard(p, { isFav: isFav(p.id) })).join('')}</div>`
      : emptyState('No pets match these filters', 'Remove a filter or two to see more animals.', '<button class="btn btn-outline" type="button" id="clear2">Clear filters</button>');
    bindFavButtons(box);
    $('#clear2', main)?.addEventListener('click', clear);
  }
  function clear() { form.reset(); for (const el of form.elements) if (el.tagName === 'SELECT') el.selectedIndex = 0; else if (el.name) el.value = ''; $('#sort', main).selectedIndex = 0; load(); }

  let t;
  form.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(load, e.target.type === 'search' ? 300 : 0); });
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  $('#sort', main).addEventListener('change', load);
  $('#clear', main).addEventListener('click', clear);
  await load();
}
