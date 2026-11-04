// Saved pets. Data: favorites-service (ids) joined with pet-service (details).
import { api } from '../api.js';
import { petCard, emptyState } from '../ui.js';
import { loadFavorites, bindFavButtons } from '../favorites.js';

export default async function favorites({ main }) {
  const ids = [...(await loadFavorites(true))];
  const pets = (await Promise.all(ids.map((id) => api.get(`/pets/${encodeURIComponent(id)}`).catch(() => null)))).filter(Boolean);

  main.innerHTML = `<div class="wrap">
    <div class="page-head"><div><h1>Saved pets</h1><p class="muted">Pets you have saved. Their status updates as shelters review applications.</p></div></div>
    <div id="list">${pets.length
      ? `<div class="grid">${pets.map((p) => petCard(p, { isFav: true })).join('')}</div>`
      : emptyState('No saved pets yet', 'Tap the heart on any pet to keep it here.', '<a class="btn btn-primary" href="#/pets">Find a pet</a>')}</div>
  </div>`;

  bindFavButtons(main, (id, on) => {
    if (!on) main.querySelector(`[data-fav="${CSS.escape(id)}"]`)?.closest('.pet-card')?.remove();
    if (!main.querySelector('.pet-card')) main.querySelector('#list').innerHTML = emptyState('No saved pets yet', 'Tap the heart on any pet to keep it here.', '<a class="btn btn-primary" href="#/pets">Find a pet</a>');
  });
}
