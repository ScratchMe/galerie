// Visionneuse plein écran : clic sur une photo, flèches du clavier, glisser sur mobile, lien direct via #3.
(() => {
  const photos = window.PHOTOS || [];
  const dlg = document.querySelector(".lb");
  if (!dlg || !photos.length) return;
  const img = dlg.querySelector("img");
  const cap = dlg.querySelector("figcaption");
  let current = 0;

  const preload = (i) => { const p = photos[(i + photos.length) % photos.length]; const im = new Image(); im.sizes = "100vw"; im.srcset = p.s; };

  function show(i) {
    current = (i + photos.length) % photos.length;
    const p = photos[current];
    img.srcset = p.s; img.sizes = "100vw"; img.src = p.u;
    img.alt = `${window.GTITLE}, photo ${current + 1} sur ${photos.length}`;
    cap.textContent = `${current + 1} / ${photos.length}`;
    history.replaceState(null, "", `#${current + 1}`);
    preload(current + 1); preload(current - 1);
  }
  function open(i) { show(i); if (!dlg.open) dlg.showModal(); }
  function close() { dlg.close(); }

  dlg.addEventListener("close", () => history.replaceState(null, "", location.pathname));
  document.querySelectorAll(".ph").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); open(Number(a.dataset.index)); }));
  dlg.querySelector(".lb-close").onclick = close;
  dlg.querySelector(".lb-prev").onclick = () => show(current - 1);
  dlg.querySelector(".lb-next").onclick = () => show(current + 1);
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.tagName === "FIGURE") close(); });
  document.addEventListener("keydown", (e) => {
    if (!dlg.open) return;
    if (e.key === "ArrowRight") show(current + 1);
    if (e.key === "ArrowLeft") show(current - 1);
  });
  let x0 = null;
  dlg.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });
  const start = parseInt(location.hash.slice(1), 10);
  if (start >= 1 && start <= photos.length) open(start - 1);
})();
