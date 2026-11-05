// ======================= API d'extension =======================
// Les fonctions de assets/ui/*.js sont insérées après ce script et ne parlent à la page que par
// window.LaCarte. Garde cette surface petite et stable.
function reglerModeTechnique(on) {
  drapeauTechnique = !!on; stockageLocal.set('technical', drapeauTechnique);
  cacheLignee.clear();
  afficherVue({ keepTransform: true, after: afficherPanneau });
  emettre('technical', drapeauTechnique);
}
function ouvrirFenetre({ title: titre = '', html = '', actions = [] } = {}) {
  const m = $('#modal'), boite = m.querySelector('.box');
  boite.innerHTML = `<h2>${h(titre)}</h2><div class="mb">${html}</div><div class="ma">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : 'soft'}" data-mi="${i}">${a.icon ? pictoI(a.icon) : ''}${h(a.label)}</button>`).join('')}<button class="btn" data-close>Fermer</button></div>`;
  const fermer = () => m.classList.remove('open');
  boite.querySelectorAll('[data-mi]').forEach((b) => b.onclick = () => { const a = actions[+b.dataset.mi]; if (a.onClick?.(fermer) !== false && !a.keepOpen) fermer(); });
  boite.querySelector('[data-close]').onclick = fermer;
  m.onmousedown = (ev) => { if (ev.target === m) fermer(); };
  m.classList.add('open');
  return { close: fermer, el: boite };
}
let minuterieMessage = null;
function afficherMessage(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(minuterieMessage); minuterieMessage = setTimeout(() => t.classList.remove('on'), 2200); }
function montrerVueReponse({ title: titre, question = '', answer: reponse = '', items: elements = [], steps: etapes = [], kind: genre = '', icon: ic = '' }) {
  const nettoyer = (arr) => (arr || []).map((x) => typeof x === 'string' ? { id: x, note: '' } : x).filter((x) => x && Q.exists(String(x.id))).map((x) => ({ id: String(x.id), note: String(x.note || '') }));
  const a = { title: titre || 'Tableau', question, answer: reponse, items: nettoyer(elements).slice(0, 24), steps: nettoyer(etapes), followups: [], ...(genre ? { kind: genre } : {}), ...(ic ? { icon: ic } : {}) };
  if (!a.items.length) { afficherMessage('Rien sur la carte ne correspond.'); return; }
  etatVue.answer = a; etatQuestion.last = a;
  allerVers('q:answer', { force: true });
}
function lireParcours({ title: titre = 'Visite guidée', description = '', steps: etapes = [], inPlace: surPlace = false }) {
  const st = etapes.map((s) => ({ ref: s.ref || s.id, note: s.note || '', title: s.title || '' })).filter((s) => Q.exists(s.ref) || s.ref === 'root');
  if (!st.length) return;
  etatVue.flow = { f: { id: 'tmp-' + Date.now(), title: titre, description, steps: st }, i: 0, inPlace: surPlace };
  etapeParcours();
}
const ext = { sections: { overview: [], item: [] }, listeners: {} };
const perso = { panel: null };
function emettre(evenement, donnees) { for (const fn of ext.listeners[evenement] || []) { try { fn(donnees); } catch (e) { console.error('la-carte extension', e); } } }
window.LaCarte = Object.freeze({
  version: 1,
  graphe: G, requetes: Q, etat: etatVue, agent: AGENT, exporte: COPIE_EXPORTEE,
  // aides pour le modèle
  infos: infosBloc, chaine: lignee, enfants: (id) => filsVisibles(id), parentDe: (id) => parentsParId.get(id), existe: (id) => Q.exists(id),
  fichiers: fichiersParChemin, noeuds: noeudsParId, routes, couleurDe: couleurBloc, cleIcone: clePicto,
  // aides pour le HTML
  h, icone: picto, iconeI: pictoI, fmt: formaterNombre, pluriel: accorder, md,
  // navigation
  aller: allerVers, reveler: localiser, selectionner: choisir, ouvrir: ouvrirBloc, monter: monterNiveau, ajuster: ajusterVue, afficher: (o) => afficherVue({ keepTransform: true, ...o }), actualiserPanneau: () => afficherPanneau(),
  montrerTableau: montrerVueReponse, jouerParcours: lireParcours, demarrerParcours: lancerParcours, arreterParcours: () => { if (etatVue.flow) finirParcours(); },
  zoneLibre: () => zoneDisponible(),
  fermerMenus: () => { fermerMenu(); fm.classList.remove('open'); elLegende.classList.remove('open'); },
  // questions
  ajouterContexteQuestion: epinglerContexte, demander: (texte) => { fermerFeuille(); champQuestion.value = texte; envoyerQuestion(); }, moteurQuestion: () => etatQuestion.engine,
  // le mode Modifier d'un plan : s'il est disponible ici, et dépôt d'une demande dans la bulle de questions pour qu'on la termine et l'envoie
  peutChanger: () => changementPossible(),
  preparerChangement(texte) {
    if (!changementPossible()) return false;
    fermerFeuille(); // sur un téléphone, la feuille de détails ouverte cache la bulle de questions : la demande serait tapée là où personne ne la voit
    reglerModeQuestion('change');
    champQuestion.value = texte;
    champQuestion.focus();
    champQuestion.setSelectionRange(texte.length, texte.length);
    return true;
  },
  // interface
  ajouterBoutonEntete({ id, label: libelle = '', icon: ic, svg, title: titre = '', onClick: auClic }) {
    const b = document.createElement('button');
    b.className = 'btn' + (libelle ? '' : ' icon'); if (id) b.id = id; b.title = titre || libelle; if (libelle) b.setAttribute('aria-label', libelle);
    b.innerHTML = `${svg ? `<svg class="i" viewBox="0 0 24 24">${svg}</svg>` : ic ? pictoI(ic) : ''}${libelle ? `<span class="bl">${h(libelle)}</span>` : ''}`;
    b.onclick = (ev) => { ev.stopPropagation(); auClic?.(ev, b); };
    $('#hdr-ext').appendChild(b);
    synchroniserEntete(); // un nouveau bouton peut rendre la barre plus haute d'une ligne
    return b;
  },
  ajouterSectionPanneau(endroit, fn) { (ext.sections[endroit] ||= []).push(fn); },
  montrerPanneau(html, liaison) { perso.panel = { html, bind: liaison }; reglerPanneau(true); afficherPanneau(); },
  fermerPanneau() { perso.panel = null; afficherPanneau(); },
  fenetre: ouvrirFenetre, message: afficherMessage, copier: (texte) => copierTexte(texte),
  icones: P,
  technique: modeTechnique, reglerTechnique: reglerModeTechnique,
  stockage: stockageLocal,
  sur(evenement, fn) { (ext.listeners[evenement] ||= []).push(fn); },
  reglerAnomalies(fn) { ext.anomalies = fn; },
  redessiner() { if (etatVue.view) afficherVue({ keepTransform: true }); },
});
drapeauTechnique = !!stockageLocal.get('technical', false);

const depart = lireHash();
etatVue.container = depart.v; etatVue.selected = depart.s;
if (depart.s && petitEcran()) { document.body.classList.remove('no-panel'); $('#btn-panel').setAttribute('aria-expanded', 'true'); } // un lien partagé vers un bloc ouvre ses détails
const policesPretes = document.fonts?.ready ? Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 1500))]) : Promise.resolve();
policesPretes.then(() => afficherVue({ after: () => { afficherPanneau(); performance.mark('carte-prete'); emettre('ready', {}); if (PLAN && window.LA_CARTE_SERVER) montrerResultatChangement(); } }));
