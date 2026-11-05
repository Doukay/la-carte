// « Commencer ici » : une visite guidée calme d'une minute à la première ouverture. Ce qu'est l'appli, ses parties principales, les services
// extérieurs dont elle dépend, puis un vrai parcours suivi de bout en bout. Les étapes viennent de graphe.visite (écrit par
// Claude dans architecture.json) ou sont construites à partir de la carte elle-même.
(() => {
  const CARTE = window.LaCarte;
  if (!CARTE) return;
  const G = CARTE.graphe;
  const { h } = CARTE;
  const VU = 'tour-seen:' + (G.projet?.name || G.meta?.rootName || 'map');

  const style = document.createElement('style');
  style.textContent = `
#tour { position: fixed; left: 16px; bottom: 76px; width: min(360px, calc(100vw - 32px)); padding: 16px 16px 12px 20px; border-radius: var(--r-panel); z-index: 6; animation: tourIn .4s var(--ease); }
#tour[hidden] { display: none; }
#tour .tk { font-size: 12px; color: var(--text-3); margin-bottom: 4px; display: flex; gap: 6px; align-items: center; }
#tour .tk i { width: 3px; height: 3px; border-radius: 50%; background: var(--text-4); }
#tour .tt { font-size: 16px; font-weight: 600; letter-spacing: -.01em; line-height: 1.35; padding-right: 22px; }
#tour .tn { color: var(--text-2); line-height: 1.55; margin-top: 6px; font-size: 13.5px; }
#tour .tip { color: var(--text-3); font-size: 12px; line-height: 1.5; margin-top: 10px; }
#tour .tf { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
#tour .dots { display: flex; gap: 4px; flex: 1; }
#tour .dots i { width: 14px; height: 3px; border-radius: 2px; background: rgba(var(--ink), .12); transition: background .3s var(--ease); }
#tour .dots i.on { background: var(--on); }
#tour .tf .btn { height: 32px; }
#tour .tf .btn.icon { width: 32px; }
#tour .tx { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; }
@keyframes tourIn { from { opacity: 0; transform: translateY(8px) scale(.98); } }
`;
  document.head.appendChild(style);

  // ---------- étapes ----------
  const couper = (s, maxi = 230) => {
    s = String(s || '').trim();
    if (s.length <= maxi) return s;
    const coupe = s.slice(0, maxi);
    const terminer = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('; '));
    return terminer > 80 ? coupe.slice(0, terminer + 1) : coupe.replace(/\s+\S*$/, '') + '…';
  };
  const listeDe = (noms) => noms.length <= 1 ? noms.join('') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
  const racines = G.nodes.filter((n) => !n.parent && n.id !== 'unassigned');
  const parTaille = (a, b) => (b.stats?.files || 0) - (a.stats?.files || 0);
  const ecransDe = (id) => (G.ecrans || []).filter((s) => s.app === id).length;

  function etapeParcours() {
    const f = (G.parcours || []).find((x) => !x.custom) || (G.parcours || [])[0];
    if (!f || !f.steps?.length) return null;
    return { ref: 'root', flow: f.id, kicker: 'Un vrai parcours', title: f.title, note: `${f.description ? couper(f.description, 160) + ' ' : ''}Appuie sur Lancer pour le suivre dans le code, une étape à la fois.` };
  }
  function etapesAuto() {
    const p = G.projet || {};
    const etapes = [{ ref: 'root', kicker: 'Le projet', title: p.name || 'Ce projet', note: couper(p.summary) || 'Une carte des parties principales de cette appli et de la façon dont elles se parlent.' }];
    const interfaces = racines.filter((n) => n.kind === 'ui').sort(parTaille).slice(0, 2);
    for (const n of interfaces) {
      const k = ecransDe(n.id);
      etapes.push({ ref: 'n:' + n.id, kicker: 'Ce que les gens utilisent', title: n.label, note: couper(n.summary, 200) + (k > 1 ? ` Elle compte ${k} écrans.` : '') });
    }
    let arriere = racines.filter((n) => n.kind === 'service' || n.kind === 'worker').sort(parTaille);
    if (!arriere.length) arriere = racines.filter((n) => !['ui', 'external', 'test', 'script', 'config', 'infra', 'misc'].includes(n.kind)).sort(parTaille);
    for (const n of arriere.slice(0, interfaces.length > 1 ? 1 : 2)) etapes.push({ ref: 'n:' + n.id, kicker: 'Dans les coulisses', title: n.label, note: couper(n.summary, 200) });
    const donnees = racines.find((n) => n.kind === 'data' && !arriere.includes(n));
    if (donnees && etapes.length < 5) etapes.push({ ref: 'n:' + donnees.id, kicker: 'Où vivent les données', title: donnees.label, note: couper(donnees.summary, 200) });
    const exterieurs = racines.filter((n) => n.kind === 'external');
    if (exterieurs.length) {
      etapes.push({
        ref: exterieurs.length === 1 ? 'n:' + exterieurs[0].id : 'root', kicker: 'Services extérieurs', title: exterieurs.length === 1 ? exterieurs[0].label : `${exterieurs.length} services extérieurs`,
        note: exterieurs.length === 1 ? couper(exterieurs[0].summary, 200) : `Elle s’appuie aussi sur ${listeDe(exterieurs.slice(0, 6).map((n) => n.label))}${exterieurs.length > 6 ? ` et ${exterieurs.length - 6} autres` : ''}. Ils sont au bord de la carte ; les lignes montrent quelles parties leur parlent.`,
      });
    }
    return etapes;
  }
  function construireEtapes() {
    const propres = (G.visite || []).filter((s) => s && s.ref && (s.ref === 'root' || CARTE.existe(s.ref))).map((s) => ({ ref: s.ref, title: s.title || CARTE.infos(s.ref).name, note: s.note || CARTE.infos(s.ref).desc || '', kicker: '' }));
    const etapes = propres.length >= 2 ? propres : etapesAuto();
    const parcoursEtape = etapeParcours();
    if (parcoursEtape && !etapes.some((s) => s.flow) && etapes.length < 9) etapes.push(parcoursEtape);
    return etapes.filter((s) => s.ref === 'root' || CARTE.existe(s.ref)).slice(0, 9);
  }

  // ---------- bulle ----------
  const bulle = document.createElement('div');
  bulle.id = 'tour';
  bulle.className = 'glass';
  bulle.hidden = true;
  bulle.setAttribute('role', 'dialog');
  bulle.setAttribute('aria-label', 'Visite guidée Commencer ici');
  document.body.appendChild(bulle);
  let etapes = [], pos = -1;
  const actif = () => pos >= 0;

  function allerA(s) {
    if (!s.ref || s.ref === 'root') { CARTE.aller('root', { select: null }); return; }
    const parent = CARTE.parentDe(s.ref) || 'root';
    if (parent === 'root') CARTE.aller('root', { select: s.ref }); // reste sur la vue d'ensemble, met juste le bloc en valeur
    else CARTE.reveler(s.ref);
  }
  function dessiner() {
    const s = etapes[pos], derniere = pos === etapes.length - 1;
    const astuce = derniere ? `Relance cette visite quand tu veux avec <b>Commencer ici</b>, en haut.${window.LaCarteScreens ? ' <b>Écrans</b> montre tout ce qu’il y a derrière chaque page.' : ''}` : '';
    bulle.innerHTML = `<button class="btn icon tx" data-x title="Fermer (Échap)">${CARTE.iconeI('x')}</button>
      <div class="tk"><span>Commencer ici</span><i></i><span>${pos + 1} sur ${etapes.length}</span>${s.kicker ? `<i></i><span>${h(s.kicker)}</span>` : ''}</div>
      <div class="tt">${h(s.title)}</div>${s.note ? `<div class="tn">${h(s.note)}</div>` : ''}${astuce ? `<div class="tip">${astuce}</div>` : ''}
      <div class="tf"><div class="dots">${etapes.map((_, k) => `<i class="${k <= pos ? 'on' : ''}"></i>`).join('')}</div>
        ${pos > 0 ? `<button class="btn icon soft" data-back title="Précédent (←)">${CARTE.iconeI('left')}</button>` : `<button class="btn" data-x>Passer</button>`}
        ${s.flow ? `<button class="btn primary" data-play>${CARTE.iconeI('right')}Lancer</button>${derniere ? '' : '<button class="btn soft" data-next>Suivant</button>'}` : `<button class="btn primary" data-next>${derniere ? 'Terminé' : 'Suivant'}</button>`}
      </div>`;
    bulle.querySelectorAll('[data-x]').forEach((b) => b.onclick = terminer);
    bulle.querySelector('[data-back]')?.addEventListener('click', arriere);
    bulle.querySelector('[data-next]')?.addEventListener('click', suivant);
    bulle.querySelector('[data-play]')?.addEventListener('click', () => { const id = s.flow; terminer(); CARTE.demarrerParcours(id); });
  }
  // se place au-dessus des boutons de zoom, et au-dessus de la bulle de questions (et de ses avis) là où elles se chevauchent
  function placer() {
    let bas = 76;
    const bulleQuestions = document.getElementById('ask');
    if (bulleQuestions) {
      const a = bulleQuestions.getBoundingClientRect(), c = bulle.getBoundingClientRect();
      const haut = [...bulleQuestions.children].filter((x) => x.offsetParent && x.getBoundingClientRect().height > 0).reduce((m, x) => Math.min(m, x.getBoundingClientRect().top), a.bottom);
      if (a.width && a.left < 16 + c.width + 12 && haut < innerHeight) bas = Math.max(bas, innerHeight - haut + 12);
    }
    bulle.style.bottom = Math.min(bas, Math.max(76, innerHeight - bulle.offsetHeight - 80)) + 'px';
  }
  window.addEventListener('resize', () => { if (actif()) placer(); });
  function montrer(i) {
    pos = i;
    bulle.hidden = false;
    dessiner();
    placer();
    allerA(etapes[pos]);
    if (pos === 0) setTimeout(() => CARTE.ajuster(true), 450);
  }
  function suivant() { if (pos >= etapes.length - 1) terminer(); else montrer(pos + 1); }
  function arriere() { if (pos > 0) montrer(pos - 1); }
  function terminer() {
    if (!actif()) return;
    pos = -1;
    bulle.hidden = true;
    CARTE.stockage.set(VU, true);
    if (CARTE.etat.container === 'root') CARTE.selectionner(null);
  }
  function demarrer() {
    etapes = construireEtapes();
    if (etapes.length < 2) { CARTE.message('Il n’y a pas encore assez de choses sur cette carte pour une visite guidée.'); return; }
    CARTE.stockage.set(VU, true);
    montrer(0);
  }

  const boutonVisite = CARTE.ajouterBoutonEntete({ id: 'tour-btn', label: 'Commencer ici', icon: 'home', title: 'Une visite guidée d’une minute de ce projet', onClick: () => (actif() ? terminer() : demarrer()) });
  const ico = boutonVisite.querySelector('svg');
  if (ico) ico.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/>'; // boussole
  window.addEventListener('keydown', (ev) => {
    if (!actif() || ev.target?.tagName === 'INPUT' || ev.target?.tagName === 'TEXTAREA') return;
    if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); terminer(); }
    else if (!CARTE.etat.flow && ev.key === 'ArrowRight') { ev.stopPropagation(); ev.preventDefault(); suivant(); }
    else if (!CARTE.etat.flow && ev.key === 'ArrowLeft') { ev.stopPropagation(); ev.preventDefault(); arriere(); }
  }, true);
  // un parcours guidé prend toute la place : on s'efface
  CARTE.sur('render', () => { if (actif() && CARTE.etat.flow) terminer(); });

  // première visite : démarre toute seule, sauf si le lien mène à un endroit précis
  let dejaLance = false;
  const lancerSiPremiereFois = () => {
    if (dejaLance) return;
    dejaLance = true;
    if (CARTE.stockage.get(VU, false) || location.hash.length > 1) return;
    setTimeout(() => { if (!actif() && !CARTE.etat.flow && CARTE.etat.container === 'root') demarrer(); }, 700);
  };
  CARTE.sur('ready', lancerSiPremiereFois);
  if (CARTE.etat.layout) lancerSiPremiereFois();

  window.LaCarteTour = { start: demarrer, end: terminer, active: actif };
})();
