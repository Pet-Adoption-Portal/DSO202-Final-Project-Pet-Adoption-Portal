// Home page. Data: search-service (latest pets), shelter-service (shelter list).
import { api } from '../api.js';
import { esc, petArt, petCard } from '../ui.js';
import { isFav, bindFavButtons } from '../favorites.js';

const FLAGS = [
  { fill: '#2d5fa6', tint: '#e4ecf7', text: '#ffffff' },
  { fill: '#ffffff', tint: '#f1f4f2', text: '#15211c' },
  { fill: '#c23b2e', tint: '#f8e5e2', text: '#ffffff' },
  { fill: '#2f7a4c', tint: '#e2f0e7', text: '#ffffff' },
  { fill: '#e3a82b', tint: '#fbf0d8', text: '#15211c' },
];

// Five newest pets hang on a prayer-flag line. The rope is a quadratic curve,
// so each flag's attachment height is computed from its x position.
function flagLine(pets) {
  const W = 560, ropeY = (x) => { const t = x / W; return (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * 120 + t * t * 26; };
  const flags = pets.slice(0, 5).map((p, i) => {
    const f = FLAGS[i];
    const x = 22 + i * 106, w = 92, y = ropeY(x + w / 2) - 4;
    const art = petArt(p, { bg: f.tint }).replace('<svg ', `<svg x="${x + 6}" y="${y + 8}" width="${w - 12}" height="106" preserveAspectRatio="xMidYMid slice" `);
    return `<g class="flag"><a href="#/pets/${esc(p.id)}" aria-label="${esc(p.name)}, ${esc(p.breed)}">
      <rect x="${x}" y="${y}" width="${w}" height="174" rx="3" fill="${f.fill}" ${f.fill === '#ffffff' ? 'stroke="#b9c6c0"' : ''}/>
      ${art}
      <text x="${x + w / 2}" y="${y + 140}" text-anchor="middle" fill="${f.text}" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="18">${esc(p.name)}</text>
      <text x="${x + w / 2}" y="${y + 160}" text-anchor="middle" fill="${f.text}" opacity=".85" font-size="11.5" font-family="Atkinson Hyperlegible, sans-serif">${esc(p.species)}</text>
    </a></g>`;
  }).join('');
  return `<div class="flagline"><svg viewBox="-10 0 580 330" aria-label="Newest pets">
    <path d="M-10 20 Q280 160 570 20" stroke="#7a6a58" stroke-width="2.5" fill="none"/>
    ${flags}
  </svg></div>`;
}

const listJoin = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a.join(''));

export default async function home({ main }) {
  const [latest, shelters] = await Promise.all([
    api.get('/search?sort=newest&limit=8'),
    api.get('/shelters'),
  ]);

  main.innerHTML = `
    <section class="hero">
      <div class="hero-inner">
        <div>
          <h1>Find a friend in Bhutan's animal shelters</h1>
          <p class="lead">Dogs, cats, rabbits and birds from shelters in ${esc(listJoin(shelters.map((s) => s.address.split(', ').pop())))} are waiting for a home. Browse, save the ones you like and apply in a few minutes.</p>
          <form class="hero-search" id="heroSearch" role="search">
            <label class="sr-only" for="hq">Search pets</label>
            <input id="hq" type="search" name="q" placeholder="Name, breed or shelter">
            <label class="sr-only" for="hs">Species</label>
            <select id="hs" name="species">
              <option value="">Any animal</option><option value="dog">Dogs</option><option value="cat">Cats</option><option value="rabbit">Rabbits</option><option value="bird">Birds</option>
            </select>
            <button class="btn btn-primary" type="submit">Search</button>
          </form>
          <div class="hero-quick">
            <a class="chip" href="#/pets?age=young">Puppies and kittens</a>
            <a class="chip" href="#/pets?goodWith=children">Good with children</a>
            <a class="chip" href="#/pets?age=senior">Seniors</a>
          </div>
        </div>
        ${flagLine(latest.items)}
      </div>
    </section>

    <div class="wrap">
      <section class="section" style="padding-top:8px">
        <div class="section-head"><h2>How adoption works</h2></div>
        <ol class="steps">
          <li><h3>Browse</h3><p class="muted">Filter by animal, age and shelter. Every listing comes straight from the shelter's staff.</p></li>
          <li><h3>Apply</h3><p class="muted">Tell the shelter about your home. Each pet takes one application at a time, so you know where you stand.</p></li>
          <li><h3>Meet</h3><p class="muted">Shelter staff review your application and arrange a visit. You get a notification and an email.</p></li>
          <li><h3>Bring them home</h3><p class="muted">Once approved, the pet is marked adopted and you can leave a review for the shelter.</p></li>
        </ol>
      </section>

      <section class="section">
        <div class="section-head"><h2>Recently listed</h2><a href="#/pets">See all ${latest.total} pets</a></div>
        <div class="grid" id="latest">${latest.items.map((p) => petCard(p, { isFav: isFav(p.id) })).join('')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Our shelters</h2><a href="#/shelters">All shelters</a></div>
        <div class="grid">${shelters.map((s, i) => `
          <article class="shelter-card">
            <div class="bar" style="background:${['#2d5fa6', '#c23b2e', '#2f7a4c', '#e3a82b'][i % 4]}"></div>
            <h3><a href="#/shelters/${esc(s.id)}">${esc(s.name)}</a></h3>
            <p class="muted small" style="margin:0">${esc(s.address)}</p>
          </article>`).join('')}</div>
      </section>
    </div>`;

  main.querySelector('#heroSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const qs = new URLSearchParams();
    if (f.get('q')) qs.set('q', f.get('q'));
    if (f.get('species')) qs.set('species', f.get('species'));
    location.hash = `#/pets${qs.toString() ? '?' + qs : ''}`;
  });
  bindFavButtons(main);
}
