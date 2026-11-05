// ======================= déplacement / zoom =======================
function appliquerTransformation() {
  const { x, y, k } = etatVue.t;
  vp.style.transform = `translate(${x}px,${y}px) scale(${k})`;
  svg.classList.toggle('lod-low', k < 0.42);
  svg.classList.toggle('lod-mid', k >= 0.42 && k < 0.75);
  svg.style.setProperty('--contre', Math.min(2.4, 1 / Math.min(k, 1)).toFixed(3));
}
const rectScene = () => svg.getBoundingClientRect();
function reglerTransformation(t, animate) {
  etatVue.t = t;
  if (animate) { vp.classList.add('anim'); requestAnimationFrame(appliquerTransformation); setTimeout(() => vp.classList.remove('anim'), 520); } else appliquerTransformation();
}
/** La zone de la carte que ne couvrent ni l'en-tête, ni le titre du contexte, ni le panneau de détails, ni la bulle de questions. */
function zoneDisponible() {
  const r = rectScene();
  const panneauOuvert = !document.body.classList.contains('no-panel');
  const surTelephone = petitEcran(); // sur un téléphone, le panneau de détails est une feuille en bas, pas une colonne sur le côté
  const largeurPanneau = panneauOuvert && !surTelephone ? $('#panel').offsetWidth + 32 : 0;
  const haut = ($('header').offsetHeight || 64) + 8 + Math.min(130, $('#context').offsetHeight);
  const bas = panneauOuvert && surTelephone ? $('#panel').offsetHeight + 24 : $('#ask').offsetHeight + 36;
  return { x: 16, y: haut, w: Math.max(200, r.width - largeurPanneau - 32), h: Math.max(140, r.height - haut - bas) };
}
function ajusterVue(animate) {
  const b = etatVue.bounds; if (!b) return;
  const a = zoneDisponible();
  const k = Math.min(a.w / (b.w + 40), a.h / (b.h + 20), 1.1);
  reglerTransformation({ k, x: a.x + (a.w - b.w * k) / 2 - b.x * k, y: a.y + Math.max(0, (a.h - b.h * k) / 2) - b.y * k }, animate);
}
function zoomerDe(f, cx, cy) {
  const r = rectScene();
  cx ??= r.width / 2; cy ??= r.height / 2;
  const k = borner(etatVue.t.k * f, 0.08, 2.5);
  reglerTransformation({ k, x: cx - (cx - etatVue.t.x) * (k / etatVue.t.k), y: cy - (cy - etatVue.t.y) * (k / etatVue.t.k) }, false);
}
// la molette ou le pincement zoome autour du curseur ; le défilement à deux doigts sur le pavé tactile déplace la carte
svg.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const r = rectScene();
  const defilementPave = !ev.ctrlKey && ev.deltaMode === 0 && (Math.abs(ev.deltaX) > 0 || Math.abs(ev.deltaY) < 40);
  if (defilementPave) reglerTransformation({ ...etatVue.t, x: etatVue.t.x - ev.deltaX, y: etatVue.t.y - ev.deltaY }, false);
  else zoomerDe(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018)), ev.clientX - r.left, ev.clientY - r.top);
}, { passive: false });
let glisse = null;
const doigts = new Map(); let pincement = null; // tactile seulement : les doigts sur la carte, et le pincement qu'ils font
let avalerClic = false; // les écrans tactiles n'envoient pas toujours un clic après un glissement ou un pincement : un drapeau (effacé au toucher suivant) empêche la fin d'un geste de sélectionner un bloc
svg.addEventListener('click', (e) => { if (avalerClic) { avalerClic = false; e.stopPropagation(); } }, true);
svg.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  if (ev.pointerType === 'touch') {
    if (doigts.size >= 2) return; // un troisième doigt est ignoré
    doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); avalerClic = false; vp.classList.remove('anim'); // une glissade encore en cours continuerait à déplacer la carte sous le doigt
    if (doigts.size === 2) { if (glisse?.moved) avalerClic = true; glisse = null; svg.classList.remove('panning'); masquerInfobulle(); pincement = { ...pincementActuel(), t: { ...etatVue.t }, moved: false }; return; }
  }
  glisse = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, tx: etatVue.t.x, ty: etatVue.t.y, moved: false };
});
window.addEventListener('pointermove', (ev) => {
  if (!glisse || ev.pointerId !== glisse.id) return; // seul le doigt qui a commencé le glissement déplace la carte
  const dx = ev.clientX - glisse.x, dy = ev.clientY - glisse.y;
  if (!glisse.moved && Math.hypot(dx, dy) < 4) return;
  glisse.moved = true; svg.classList.add('panning'); masquerInfobulle();
  reglerTransformation({ ...etatVue.t, x: glisse.tx + dx, y: glisse.ty + dy }, false);
});
const finGlisse = (ev) => {
  if (!glisse || ev.pointerId !== glisse.id) return;
  if (glisse.moved) { if (ev.pointerType === 'touch') avalerClic = true; else svg.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true }); }
  glisse = null; svg.classList.remove('panning');
};
window.addEventListener('pointerup', finGlisse);
window.addEventListener('pointercancel', finGlisse); // le navigateur a repris le toucher : on termine le glissement au lieu de le laisser bloqué
svg.addEventListener('click', () => choisir(null));
// deux doigts : le pincement zoome autour du point entre eux, et les bouger ensemble déplace la carte (un seul doigt fait toujours glisser)
const pincementActuel = () => { const [a, b] = [...doigts.values()]; return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
window.addEventListener('pointermove', (ev) => {
  if (!doigts.has(ev.pointerId)) return;
  doigts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (!pincement || doigts.size !== 2) return;
  const maintenant = pincementActuel(), r = rectScene(), t0 = pincement.t;
  const k = borner(t0.k * maintenant.d / pincement.d, 0.08, 2.5), f = k / t0.k;
  pincement.moved = true;
  reglerTransformation({ k, x: (maintenant.x - r.left) - ((pincement.x - r.left) - t0.x) * f, y: (maintenant.y - r.top) - ((pincement.y - r.top) - t0.y) * f }, false);
});
const leverDoigt = (ev) => {
  if (!doigts.delete(ev.pointerId)) return;
  if (pincement?.moved) avalerClic = true; // lever un doigt après un pincement n'est pas un toucher
  if (doigts.size < 2) pincement = null;
};
window.addEventListener('pointerup', leverDoigt);
window.addEventListener('pointercancel', leverDoigt);
// sur un appareil tactile, la barre d'adresse du navigateur qui apparaît et disparaît change la taille de la fenêtre de quelques pixels en plein geste : cela ne doit pas réajuster la carte
let derniereLargeur = innerWidth;
window.addEventListener('resize', () => {
  const seulementHauteur = innerWidth === derniereLargeur; derniereLargeur = innerWidth;
  if (matchMedia('(pointer: coarse)').matches && (seulementHauteur || glisse || pincement)) return;
  ajusterVue(false);
});
$('#z-in').onclick = () => zoomerDe(1.25);
$('#z-out').onclick = () => zoomerDe(0.8);
$('#z-fit').onclick = () => ajusterVue(true);

