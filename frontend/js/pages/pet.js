// Pet detail. Data: pet-service (the record), adoption-service (live availability),
// shelter-service (contact), review-service (shelter rating), favorites-service.
import { api } from '../api.js';
import { currentUser, is } from '../auth.js';
import { esc, petArt, statusBadge, formatAge, stars, heartIcon, petCard } from '../ui.js';
import { isFav, bindFavButtons } from '../favorites.js';

export default async function petDetail({ main, params }) {
  const pet = await api.get(`/pets/${encodeURIComponent(params.id)}`);
  const [availability, shelter, reviews, more] = await Promise.all([
    api.get(`/adoptions/availability/${encodeURIComponent(pet.id)}`),
    api.get(`/shelters/${encodeURIComponent(pet.shelterId)}`),
    api.get(`/reviews?shelterId=${encodeURIComponent(pet.shelterId)}`),
    api.get(`/search?shelterId=${encodeURIComponent(pet.shelterId)}&limit=4`),
  ]);
  const status = availability.status;
  const u = currentUser();
  const goodWith = { adults: 'Adults', children: 'Children', dogs: 'Other dogs', cats: 'Cats' };
  const yesNo = (v) => (v ? 'Yes' : 'Not yet');

  let action;
  if (status === 'adopted') {
    action = `<div class="notice notice-info"><strong>${esc(pet.name)} has been adopted.</strong> Other pets at ${esc(shelter.name)} are still waiting.</div>`;
  } else if (status === 'pending') {
    action = `<div class="notice notice-warn"><strong>An application for ${esc(pet.name)} is being reviewed.</strong> If it is not approved, ${esc(pet.name)} becomes available again. Save this pet to keep an eye on it.</div>`;
  } else if (!u) {
    action = `<div class="actions"><a class="btn btn-primary" href="#/login?next=${encodeURIComponent('#/apply/' + pet.id)}">Log in to apply</a></div>`;
  } else if (is.adopter()) {
    action = `<div class="actions"><a class="btn btn-primary" href="#/apply/${esc(pet.id)}">Apply to adopt ${esc(pet.name)}</a></div>`;
  } else if (is.staff() && u.shelterId === pet.shelterId) {
    action = `<div class="actions"><a class="btn btn-outline" href="#/staff/pets/${esc(pet.id)}/edit">Edit this listing</a></div>`;
  } else {
    action = `<p class="muted">Applications are made from adopter accounts.</p>`;
  }

  main.innerHTML = `<div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/pets">Find a pet</a> / ${esc(pet.name)}</nav>
    <div class="detail">
      <div class="art-lg">${petArt(pet)}</div>
      <div>
        <div class="detail-head">
          <div>${statusBadge(status)}<h1 style="margin-top:10px">${esc(pet.name)}</h1></div>
          ${is.adopter() || !u ? `<button class="fav-btn" data-fav="${esc(pet.id)}" aria-pressed="${isFav(pet.id)}" aria-label="Save ${esc(pet.name)} to favourites">${heartIcon}</button>` : ''}
        </div>
        <p style="font-size:1.1rem">${esc(pet.description)}</p>
        <table class="facts-table">
          <tr><th>Breed</th><td>${esc(pet.breed)}</td></tr>
          <tr><th>Age</th><td>${esc(formatAge(pet.ageMonths))}</td></tr>
          <tr><th>Sex</th><td>${esc(pet.sex)}</td></tr>
          <tr><th>Size</th><td>${esc(pet.size)}</td></tr>
          <tr><th>Vaccinated</th><td>${yesNo(pet.vaccinated)}</td></tr>
          <tr><th>Neutered or spayed</th><td>${yesNo(pet.neutered)}</td></tr>
          <tr><th>Good with</th><td>${esc((pet.goodWith || []).map((g) => goodWith[g] || g).join(', ') || 'Ask the shelter')}</td></tr>
        </table>
        ${action}
        <div class="panel" style="margin-top:24px">
          <h3 style="margin-bottom:4px"><a href="#/shelters/${esc(shelter.id)}">${esc(shelter.name)}</a></h3>
          <p class="muted small" style="margin-bottom:8px">${esc(shelter.address)}</p>
          <p style="margin:0">${stars(reviews.average)} <span class="muted small">${reviews.count ? `${reviews.average} from ${reviews.count} review${reviews.count === 1 ? '' : 's'}` : 'No reviews yet'}</span></p>
          <p class="small" style="margin:8px 0 0">${esc(shelter.phone)}${shelter.phone && shelter.email ? ', ' : ''}<a href="mailto:${esc(shelter.email)}">${esc(shelter.email)}</a></p>
        </div>
      </div>
    </div>
    ${more.items.filter((p) => p.id !== pet.id).length ? `<section class="section">
      <div class="section-head"><h2>More from ${esc(shelter.name)}</h2></div>
      <div class="grid">${more.items.filter((p) => p.id !== pet.id).slice(0, 3).map((p) => petCard(p, { isFav: isFav(p.id) })).join('')}</div>
    </section>` : ''}
  </div>`;
  bindFavButtons(main);
}
