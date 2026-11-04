// Fallback for unknown routes.
export default async function notFound({ main }) {
  main.innerHTML = `<div class="wrap wrap-narrow">
    <h1>This page does not exist</h1>
    <p class="muted">The link may be old, or the pet may have been removed.</p>
    <div class="actions"><a class="btn btn-primary" href="#/pets">Find a pet</a><a class="btn btn-outline" href="#/">Go to home</a></div>
  </div>`;
}
