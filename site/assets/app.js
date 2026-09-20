// Minimal placeholder behaviour: stamp the page with the load time so it is
// obvious when a fresh deploy has gone out.
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("loaded-at");
  if (!el) return;

  const now = new Date();
  el.dateTime = now.toISOString();
  el.textContent = now.toLocaleString();
});
