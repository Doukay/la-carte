// ======================= navigation =======================
function ecrireHash(conteneur, sel) {
  if (conteneur.startsWith('q:')) return; // les vues de réponse sont temporaires
  const p = new URLSearchParams();
  if (conteneur !== 'root') p.set('v', conteneur);
  if (sel && typeof sel === 'string') p.set('s', sel);
  const s = p.toString();
  try { if (location.hash.slice(1) !== s) history.pushState(null, '', s ? '#' + s : location.pathname + location.search); } catch {}
}
function lireHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  let v = p.get('v') || 'root', s = p.get('s');
  if (v !== 'root' && !parentsParId.has(v)) v = 'root';
  if (s && !parentsParId.has(s) && !s.startsWith('x:') && !s.startsWith('m:')) s = null;
  return { v, s };
}
window.addEventListener('popstate', () => { const { v, s } = lireHash(); allerVers(v, { select: s, push: false }); });

async function allerVers(conteneur, { select: sel = null, push: pousser = true, zoomFrom: zoomDepuis = null, after, force = false } = {}) {
  masquerInfobulle();
  perso.panel = null;
  const aChange = conteneur !== etatVue.container;
  etatVue.container = conteneur; etatVue.selected = sel;
  if (pousser) ecrireHash(conteneur, sel);
  if (!aChange && etatVue.layout && !force) { appliquerSelection(); afficherPanneau(); if (after) after(); return; }
  const c = zoomDepuis && etatVue.layout?.children.find((x) => x.id === zoomDepuis);
  if (c) {
    const r = rectScene();
    const k = Math.min(r.width / c.width, r.height / c.height) * 0.6;
    reglerTransformation({ k, x: r.width / 2 - (c.x + c.width / 2) * k, y: r.height / 2 - (c.y + c.height / 2) * k }, true);
    vp.style.opacity = '0';
    await new Promise((ok) => setTimeout(ok, 260));
  }
  vp.classList.remove('anim'); vp.style.opacity = '0';
  await afficherVue({ after: () => { vp.classList.add('anim'); requestAnimationFrame(() => { vp.style.opacity = '1'; }); setTimeout(() => vp.classList.remove('anim'), 340); afficherPanneau(); if (after) after(); } });
}
function ouvrirBloc(element) {
  if (element.startsWith('x:')) { localiser(entiteConnecteur(element)); return; }
  if (element.startsWith('m:')) return;
  if (etatVue.container === 'q:answer' && !ouvrable(element)) { localiser(element); return; }
  if (!ouvrable(element)) { choisir(element); return; }
  fermerFeuille();
  allerVers(element, { zoomFrom: element });
}
function monterNiveau() { if (etatVue.container === 'root') return; fermerFeuille(); const depuis = etatVue.container; allerVers(parentsParId.get(depuis) || 'root', { select: depuis }); }
function localiser(element) {
  if (element === 'root') return allerVers('root');
  const conteneur = parentsParId.get(element) || 'root';
  allerVers(conteneur, { select: element, after: () => { const g = etatVue.chipEls.get(element); if (g) { g.classList.remove('flash'); void g.getBBox(); g.classList.add('flash'); centrerSur(element); } } });
}
/** Déplace la carte juste assez pour qu'un bloc ne soit pas caché derrière la barre du haut ou la feuille ; le zoom et le reste ne changent pas. */
function amenerDansVue(element) {
  const c = etatVue.layout?.children.find((x) => x.id === element); if (!c) return;
  const a = zoneDisponible(), { k, x, y } = etatVue.t;
  const boite = { l: c.x * k + x, t: c.y * k + y, w: c.width * k, h: c.height * k };
  let dx = 0, dy = 0;
  if (boite.l + boite.w > a.x + a.w) dx = a.x + a.w - (boite.l + boite.w);
  if (boite.l + dx < a.x) dx = a.x - boite.l;
  if (boite.t + boite.h > a.y + a.h) dy = a.y + a.h - (boite.t + boite.h);
  if (boite.t + dy < a.y) dy = a.y - boite.t;
  if (dx || dy) reglerTransformation({ k, x: x + dx, y: y + dy }, true);
}
function centrerSur(element) {
  const c = etatVue.layout?.children.find((x) => x.id === element); if (!c) return;
  const a = zoneDisponible();
  const k = Math.max(etatVue.t.k, 0.75);
  reglerTransformation({ k, x: a.x + a.w / 2 - (c.x + c.width / 2) * k, y: a.y + a.h / 2 - (c.y + c.height / 2) * k }, true);
}

