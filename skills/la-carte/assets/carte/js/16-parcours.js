// ======================= parcours =======================
const fm = $('#flowmenu');
fm.addEventListener('click', (ev) => ev.stopPropagation());
function afficherMenuParcours() {
  fm.innerHTML = G.parcours.map((f) => f.custom && !COPIE_EXPORTEE
    ? `<div class="r custom" data-flow="${h(f.id)}"><div class="rt"><b>${h(f.title)}<span class="yours">à toi</span></b><span>${f.steps.length} étapes${f.description ? ' · ' + h(f.description) : ''}</span></div><button class="del" data-del="${h(f.id)}" title="Supprimer le parcours">${pictoI('x')}</button></div>`
    : `<div class="r" data-flow="${h(f.id)}"><b>${h(f.title)}</b><span>${f.steps.length} étapes${f.description ? ' · ' + h(f.description) : ''}</span></div>`).join('')
    + (COPIE_EXPORTEE ? (G.parcours.length ? '' : '<div class="r" style="cursor:default"><span>Aucun parcours dans cette copie.</span></div>') : (G.parcours.length ? '<div class="mi-sep"></div>' : '')
    + `<div class="r new" data-new>${pictoI('spark')}<b>Demander un nouveau parcours…</b></div>`);
  fm.querySelectorAll('[data-flow]').forEach((r) => r.onclick = () => { fm.classList.remove('open'); lancerParcours(r.dataset.flow); });
  fm.querySelectorAll('[data-del]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); supprimerParcoursPerso(b.dataset.del); });
  const nf = fm.querySelector('[data-new]'); if (nf) nf.onclick = montrerFormulaireParcours;
}
function montrerFormulaireParcours() {
  fm.innerHTML = `<form class="ff"><label>Décris ce qu'il faut suivre, et ${AGENT.name} construit un parcours pas à pas à travers la carte.</label>
    <textarea placeholder="par ex. Comment une commande est-elle facturée via Stripe ?" spellcheck="false"></textarea>
    ${etatQuestion.engine ? '' : `<div class="note">Il faut ${AGENT.cli} (lance node la-carte/.cache/serveur.mjs) ou l\'application Claude.</div>`}
    <div class="ffa"><button type="button" class="btn" data-cancel>Annuler</button><button type="submit" class="btn primary" ${etatQuestion.engine ? '' : 'disabled'}>Construire le parcours</button></div></form>`;
  const formulaire = fm.querySelector('form'), ta = formulaire.querySelector('textarea');
  setTimeout(() => ta.focus(), 30);
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); formulaire.requestSubmit(); } if (ev.key === 'Escape') { ev.stopPropagation(); afficherMenuParcours(); } });
  formulaire.querySelector('[data-cancel]').onclick = afficherMenuParcours;
  formulaire.onsubmit = (ev) => { ev.preventDefault(); const p = ta.value.trim(); if (!p) return; fm.classList.remove('open'); afficherMenuParcours(); demanderParcours(p); };
}

// Les parcours personnalisés sont conservés à côté de la carte quand elle est servie (parcours-perso.json, intégré par construire.mjs),
// sinon dans ce navigateur. Les étapes sont enregistrées avec des références stables pour survivre aux reconstructions.
const CLE_PARCOURS = `flows:${G.projet.name}`;
const refStable = (id) => id.startsWith('r:') ? `route:${routes[+id.slice(2)].m} ${routes[+id.slice(2)].p}` : id.startsWith('s:') ? `sym:${symboleDe(id).f.p}#${symboleDe(id).s[0]}` : id;
function refVivante(ref) {
  if (ref.startsWith('route:')) { const i = routes.findIndex((r) => `${r.m} ${r.p}` === ref.slice(6)); return i < 0 ? null : 'r:' + i; }
  if (ref.startsWith('sym:')) { const p = ref.slice(4, ref.lastIndexOf('#')), nm = ref.slice(ref.lastIndexOf('#') + 1); const i = fichiersParChemin.get(p)?.s?.findIndex((s) => s[0] === nm) ?? -1; return i < 0 ? null : `s:${p}#${i}`; }
  return Q.exists(ref) ? ref : null;
}
const versEnregistre = (fl) => ({ id: fl.id, title: fl.title, description: fl.description, steps: fl.steps.map((s) => ({ ref: refStable(s.ref), note: s.note })) });
function ajouterParcours(enregistre) {
  if (G.parcours.some((x) => x.id === enregistre.id)) return null;
  const etapes = (enregistre.steps || []).map((s) => ({ ref: refVivante(s.ref), note: s.note || '' })).filter((s) => s.ref);
  if (etapes.length < 2) return null;
  const fl = { id: enregistre.id, title: enregistre.title || 'Parcours', description: enregistre.description || '', steps: etapes, custom: true };
  G.parcours.push(fl);
  return fl;
}
const apiServeur = (methode, corps) => fetch('/api/flows', { method: methode, headers: { 'content-type': 'application/json', 'x-la-carte-token': window.LA_CARTE_SERVER.token }, ...(corps ? { body: JSON.stringify(corps) } : {}) }).then((r) => r.json());
async function enregistrerParcoursPerso(fl) {
  if (window.LA_CARTE_SERVER) { try { await apiServeur('POST', { flow: versEnregistre(fl) }); return; } catch {} }
  stockageLocal.set(CLE_PARCOURS, [...stockageLocal.get(CLE_PARCOURS, []).filter((x) => x.id !== fl.id), versEnregistre(fl)]);
}
async function supprimerParcoursPerso(id) {
  G.parcours = G.parcours.filter((x) => x.id !== id);
  if (etatVue.flow?.f.id === id) finirParcours();
  if (window.LA_CARTE_SERVER) { try { await apiServeur('DELETE', { id }); } catch {} }
  stockageLocal.set(CLE_PARCOURS, stockageLocal.get(CLE_PARCOURS, []).filter((x) => x.id !== id));
  afficherMenuParcours();
}
async function chargerParcoursPerso() {
  for (const s of stockageLocal.get(CLE_PARCOURS, [])) ajouterParcours(s);
  if (window.LA_CARTE_SERVER) { try { for (const s of (await apiServeur('GET')).parcours || []) ajouterParcours(s); } catch {} }
  afficherMenuParcours();
}

// Servi par serveur.mjs : recharge sur place quand la carte est reconstruite (la vue vit dans le hash de l'URL). Si le
// serveur redémarre, le jeton de cet onglet est périmé et le flux se ferme pour de bon : on attend donc son retour.
(function rechargementAuto() {
  const S = window.LA_CARTE_SERVER;
  if (!S || typeof EventSource === 'undefined') return;
  const recharger = () => { afficherMessage('Carte mise à jour'); setTimeout(() => location.reload(), 500); };
  const es = new EventSource('/api/events?token=' + encodeURIComponent(S.token));
  es.addEventListener('reload', recharger);
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) return; // une connexion coupée se rétablit toute seule
    // chaque seconde au début (un redémarrage dure à peu près autant), puis toutes les 5 s, pendant 30 minutes au plus
    const t0 = Date.now();
    const verifier = () => fetch('/', { cache: 'no-store' }).then((r) => (r.ok ? recharger() : suivant()), suivant);
    const suivant = () => { const age = Date.now() - t0; if (age < 30 * 60000) setTimeout(verifier, age < 30000 ? 1000 : 5000); };
    verifier();
  };
})();

async function demanderParcours(demande) {
  if (!etatQuestion.engine) { reglerAvertissement(window.LA_CARTE_SERVER ? 'cli_missing' : 'no_engine'); return; }
  if (etatQuestion.busy) annulerQuestion();
  reglerOccupe(true);
  etatQuestion.ctl = new AbortController();
  const libelle = `Nouveau parcours : ${demande}`;
  const lignes = ['Réflexion…'];
  const progression = (t) => { lignes.push(t); montrerProgression(libelle, lignes.slice(-6)); };
  montrerProgression(libelle, lignes);
  try {
    const brut = etatQuestion.engine === 'cli' ? await demanderViaCli(demande, progression, 'flow') : await demanderViaApp(demande, progression, 'flow');
    const etapes = (brut.steps || []).map((s) => ({ ref: String(s.id || ''), note: String(s.note || '') })).filter((s) => Q.exists(s.ref));
    if (etapes.length < 2) throw { code: 'flow_empty', message: `${AGENT.name} n'a pas trouvé assez d'étapes reliées pour cela. Essaie de dire où il commence ou où il se termine.` };
    const fl = { id: 'custom-' + Date.now().toString(36), title: String(brut.title || demande).slice(0, 80), description: String(brut.description || ''), steps: etapes, custom: true };
    G.parcours.push(fl);
    await enregistrerParcoursPerso(fl);
    afficherMenuParcours();
    afficherFeuille(libelle, `<p>Ajouté aux Parcours : <strong>${h(fl.title)}</strong> (${accorder(fl.steps.length, 'étape')}).${fl.description ? ' ' + h(fl.description) : ''}</p>
      <div class="sheet-actions"><button class="btn soft" data-play="${h(fl.id)}">${pictoI('right')}Rejouer</button></div>`);
    feuille.querySelector('[data-play]').onclick = () => lancerParcours(fl.id);
    lancerParcours(fl.id);
  } catch (e) {
    if (e?.name === 'AbortError') montrerEchec(libelle, 'cancelled');
    else montrerEchec(libelle, e?.code || 'upstream_error', e?.message || String(e));
  } finally { reglerOccupe(false); }
}
const elLegende = $('#legend');
$('#flows-btn').onclick = (ev) => { ev.stopPropagation(); elLegende.classList.remove('open'); fm.classList.toggle('open'); };
$('#filters-btn').onclick = (ev) => { ev.stopPropagation(); fm.classList.remove('open'); elLegende.classList.toggle('open'); };
elLegende.addEventListener('click', (ev) => ev.stopPropagation());
window.addEventListener('click', () => { fm.classList.remove('open'); elLegende.classList.remove('open'); });
function lancerParcours(id) { const f = G.parcours.find((x) => x.id === id); if (!f) return; etatVue.flow = { f, i: 0 }; etapeParcours(); }
function finirParcours() { etatVue.flow = null; document.body.classList.remove('in-flow'); $('#flowbar').hidden = true; vp.querySelectorAll('.flowfx').forEach((x) => x.remove()); choisir(null); }
function conteneurCommun(a, b) {
  const cb = new Set(lignee(b));
  for (const x of lignee(a)) if (cb.has(x)) return (x === a || x === b) ? (parentsParId.get(x) || 'root') : x;
  return 'root';
}
function etapeParcours() {
  document.body.classList.add('in-flow'); // les visites guidées des réponses et la visite guidée jouent aussi des parcours
  const { f, i } = etatVue.flow;
  const a = f.steps[i].ref, b = f.steps[i + 1]?.ref;
  const conteneur = b ? conteneurCommun(a, b) : parentsParId.get(a) || 'root';
  const barre = $('#flowbar'); barre.hidden = false;
  barre.innerHTML = `<div class="ft"><div class="fk">${h(f.title)} · étape ${i + 1} sur ${f.steps.length}</div><b>${h(infosBloc(a).name)}</b>${b ? ` <span>→</span> <b>${h(infosBloc(b).name)}</b>` : ''}<br><span>${h(f.steps[i].note)}</span><div class="dots">${f.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div></div>
    <button class="btn icon" id="fl-prev" title="Étape précédente" aria-label="Étape précédente" ${i === 0 ? 'disabled' : ''}>${pictoI('left')}</button><button class="btn icon" id="fl-next" title="${i >= f.steps.length - 1 ? 'Terminer' : 'Étape suivante'}" aria-label="${i >= f.steps.length - 1 ? 'Terminer' : 'Étape suivante'}">${pictoI(i >= f.steps.length - 1 ? 'x' : 'right')}</button><button class="btn icon" id="fl-x" title="Quitter" aria-label="Quitter le parcours">${pictoI('x')}</button>`;
  $('#fl-prev').onclick = () => { etatVue.flow.i--; etapeParcours(); };
  $('#fl-next').onclick = () => { if (etatVue.flow.i >= f.steps.length - 1) finirParcours(); else { etatVue.flow.i++; etapeParcours(); } };
  $('#fl-x').onclick = finirParcours;
  // la visite guidée d'une réponse se joue sur le tableau de la réponse lui-même
  if (etatVue.flow.inPlace) { if (etatVue.container === 'q:answer') surlignerParcours(a, b); else allerVers('q:answer', { after: () => surlignerParcours(a, b) }); }
  else allerVers(conteneur, { after: () => surlignerParcours(a, b) });
}
function surlignerParcours(a, b) {
  vp.querySelectorAll('.flowfx').forEach((x) => x.remove());
  const ctx = { container: etatVue.container, vis: new Set(etatVue.view.visible), cchain: new Set(lignee(etatVue.container)) };
  const pa = projeter(a, ctx)?.item, pb = b ? projeter(b, ctx)?.item : null;
  svg.classList.add('dim');
  for (const g of etatVue.chipEls.values()) g.classList.remove('hl', 'sel');
  for (const x of etatVue.edgeEls.values()) { x.g.classList.remove('hl'); x.pg.classList.remove('hl'); }
  listeColonne.querySelectorAll('.col-bloc.sel').forEach((x) => x.classList.remove('sel'));
  if (pa) { etatVue.chipEls.get(pa)?.classList.add('hl', 'sel'); montrerDansColonne(pa); }
  if (pb) etatVue.chipEls.get(pb)?.classList.add('hl');
  if (!pa || !pb) return;
  let chemin = null;
  for (const x of etatVue.edgeEls.values()) if ((x.e.a === pa && x.e.b === pb) || (x.e.a === pb && x.e.b === pa)) { x.g.classList.add('hl'); x.pg.classList.add('hl'); chemin = { d: x.d, reverse: x.e.a === pb }; break; }
  if (!chemin) {
    const A = etatVue.layout.children.find((c) => c.id === pa), B = etatVue.layout.children.find((c) => c.id === pb);
    const x1 = A.x + A.width, y1 = A.y + A.height / 2, x2 = B.x, y2 = B.y + B.height / 2, mx = (x1 + x2) / 2;
    chemin = { d: cheminArrondi([{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }]), reverse: false };
    el('path', { class: 'flowlink flowfx', d: chemin.d }, etatVue.fxLayer);
  }
  const point = el('circle', { class: 'pulse flowfx', r: 4.5 }, etatVue.fxLayer);
  const anim = el('animateMotion', { dur: '1.5s', repeatCount: 'indefinite', path: chemin.d, keyPoints: chemin.reverse ? '1;0' : '0;1', keyTimes: '0;1', calcMode: 'linear' }, point);
  anim.beginElement?.();
}

