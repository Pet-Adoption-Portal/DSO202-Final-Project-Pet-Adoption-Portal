// Client-side cache of the adopter's saved pets (favorites-service).
// Every page that shows pet cards calls bindFavButtons() after rendering.

import { api } from './api.js';
import { is } from './auth.js';
import { toast, $$ } from './ui.js';

let ids = new Set();
let loaded = false;

export async function loadFavorites(force = false) {
  if (!is.adopter()) { ids = new Set(); loaded = false; return ids; }
  if (loaded && !force) return ids;
  try { ids = new Set(await api.get('/favorites')); loaded = true; } catch { ids = new Set(); }
  return ids;
}
export function isFav(id) { return ids.has(id); }
export function resetFavorites() { ids = new Set(); loaded = false; }

export async function toggleFavorite(id) {
  if (!is.loggedIn()) { location.hash = `#/login?next=${encodeURIComponent(location.hash)}`; return null; }
  if (!is.adopter()) { toast('Only adopter accounts can save pets.', 'bad'); return null; }
  const on = !ids.has(id);
  if (on) { await api.post('/favorites', { petId: id }); ids.add(id); }
  else { await api.del(`/favorites/${encodeURIComponent(id)}`); ids.delete(id); }
  return on;
}

export function bindFavButtons(root, onChange) {
  for (const btn of $$('[data-fav]', root)) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const on = await toggleFavorite(btn.dataset.fav);
        if (on === null) return;
        btn.setAttribute('aria-pressed', String(on));
        toast(on ? 'Saved to favourites' : 'Removed from favourites');
        onChange?.(btn.dataset.fav, on);
      } catch (err) { toast(err.message, 'bad'); }
    });
  }
}
