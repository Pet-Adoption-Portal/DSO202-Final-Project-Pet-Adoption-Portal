// One shelter: details (shelter-service), its pets (search-service), reviews (review-service).
import { api } from '../api.js';
import { is } from '../auth.js';
import { esc, stars, petCard, formatDate, emptyState, toast, $ } from '../ui.js';
import { isFav, bindFavButtons } from '../favorites.js';

export default async function shelter({ main, params, query, rerender }) {
  const id = encodeURIComponent(params.id);
  const [s, pets, reviews] = await Promise.all([
    api.get(`/shelters/${id}`),
    api.get(`/search?shelterId=${id}`),
    api.get(`/reviews?shelterId=${id}`),
  ]);

  const reviewForm = is.adopter() ? `<form class="panel" id="reviewForm" novalidate style="margin-top:20px">
      <h3>Review ${esc(s.name)}</h3>
      <p class="form-error" id="err"></p>
      <fieldset style="border:0;padding:0;margin:0 0 12px">
        <legend class="label" style="font-weight:700;margin-bottom:6px">Your rating</legend>
        <div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="r${n}" name="rating" value="${n}"><label for="r${n}" title="${n} star${n > 1 ? 's' : ''}">★</label>`).join('')}</div>
      </fieldset>
      <div class="field"><label for="comment">Comment</label><textarea id="comment" name="comment" placeholder="How was your experience with this shelter?"></textarea></div>
      <button class="btn btn-primary" type="submit">Post review</button>
    </form>` : '';

  main.innerHTML = `<div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/shelters">Shelters</a> / ${esc(s.name)}</nav>
    <div class="page-head">
      <div><h1>${esc(s.name)}</h1><p class="muted">${esc(s.address)}</p></div>
      <p>${stars(reviews.average)} <span class="muted">${reviews.count ? `${reviews.average} from ${reviews.count} review${reviews.count === 1 ? '' : 's'}` : 'No reviews yet'}</span></p>
    </div>
    <div style="max-width:70ch">
      <p style="font-size:1.1rem">${esc(s.about)}</p>
      <p>${esc(s.phone)}${s.phone ? '<br>' : ''}<a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p>
    </div>
    <section class="section">
      <div class="section-head"><h2>Available pets (${pets.total})</h2></div>
      ${pets.items.length ? `<div class="grid">${pets.items.map((p) => petCard(p, { isFav: isFav(p.id) })).join('')}</div>` : emptyState('No pets available right now', 'Check back soon, or look at other shelters.')}
    </section>
    <section class="section wrap-mid" id="reviews" style="padding-left:0;padding-right:0">
      <div class="section-head"><h2>Reviews</h2></div>
      ${reviews.items.length ? `<div class="panel">${reviews.items.map((r) => `<div class="review">
          <p style="margin:0">${stars(r.rating)} <strong>${esc(r.authorName)}</strong> <span class="muted small">${esc(formatDate(r.createdAt))}</span></p>
          <p style="margin:6px 0 0">${esc(r.comment)}</p></div>`).join('')}</div>`
        : emptyState('No reviews yet', 'Adopters can review a shelter after visiting.')}
      ${reviewForm}
    </section>
  </div>`;

  bindFavButtons(main);
  if (query.review) setTimeout(() => $('#reviewForm', main)?.scrollIntoView({ block: 'center' }), 50);
  $('#reviewForm', main)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api.post('/reviews', { shelterId: s.id, rating: Number(f.get('rating')), comment: f.get('comment') });
      toast('Review posted');
      rerender();
    } catch (ex) { $('#err', main).textContent = ex.message; }
  });
}
