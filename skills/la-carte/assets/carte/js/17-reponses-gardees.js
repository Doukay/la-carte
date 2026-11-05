// ======================= questions de base et réponses gardées (servies par serveur.mjs) =======================
// Une liste s'ouvre au-dessus de la barre de question : les questions de base, puis celles déjà posées. Une réponse gardée
// s'affiche sans jeton ; le serveur dit si les fichiers qu'elle utilise ont changé depuis, et « Reposer la question » repart vers Claude.
const QUESTIONS_DE_BASE = PLAN ? [] : [
  'Comment ça fonctionne ?',
  'Comment lancer le projet ?',
  'Où sont rangées les données ?',
  'De quels services extérieurs dépend-il ?',
  'Que faut-il éviter de toucher ?',
];
const listeQuestions = $('#ask-liste');
etatQuestion.gardees = [];
const enteteServeur = () => ({ 'content-type': 'application/json', 'x-la-carte-token': window.LA_CARTE_SERVER.token });
const dateCourte = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };

async function chargerQuestions() {
  try { etatQuestion.gardees = (await (await fetch('/api/questions', { headers: enteteServeur() })).json()).questions || []; } catch { etatQuestion.gardees = []; }
  if (!listeQuestions.hidden) afficherListeQuestions();
}

function afficherListeQuestions() {
  const filtre = laCarteCleQuestion(champQuestion.value);
  const garde = (cle) => etatQuestion.gardees.find((e) => e.cle === cle && !e.suiteDe);
  const garde_ = new Set(QUESTIONS_DE_BASE.map(laCarteCleQuestion));
  const correspond = (texte) => !filtre || laCarteCleQuestion(texte).includes(filtre);
  const rang = (texte, e, info) => `<div class="al-rang">
      <button type="button" class="al-q" ${e ? `data-id="${h(e.id)}"` : `data-base="${h(texte)}"`} title="${h(e?.suiteDe ? `Suite de « ${e.suiteDe} »` : texte)}"><span class="al-t">${h(texte)}</span>${info ? `<span class="al-info">${h(info)}</span>` : ''}</button>
      ${e ? `<button type="button" class="al-x" data-oublier="${h(e.id)}" title="Oublier cette question" aria-label="Oublier « ${h(texte)} »">${pictoI('x')}</button>` : ''}
    </div>`;
  const base = QUESTIONS_DE_BASE.filter(correspond).map((q) => { const e = garde(laCarteCleQuestion(q)); return rang(q, e, e ? 'déjà répondue' : ''); });
  const posees = etatQuestion.gardees.filter((e) => !(garde_.has(e.cle) && !e.suiteDe) && correspond(e.question)).map((e) => rang(e.question, e, e.suiteDe ? `suite · ${dateCourte(e.at)}` : dateCourte(e.at)));
  const vide = !base.length && !posees.length;
  // pendant une conversation, la liste ne recouvre la réponse que si ce qu'on écrit ressemble à une question déjà posée
  const masquer = vide || etatQuestion.busy || etatQuestion.mode === 'change' || (!feuille.hidden && !filtre);
  listeQuestions.hidden = masquer;
  $('#ask').classList.toggle('liste-ouverte', !masquer);
  if (masquer) return;
  listeQuestions.innerHTML = `${base.length ? `<div class="al-titre">Questions de base</div>${base.join('')}` : ''}${posees.length ? `<div class="al-titre">Déjà posées</div>${posees.join('')}` : ''}`;
  listeQuestions.querySelectorAll('[data-base]').forEach((b) => b.onclick = () => { fermerListeQuestions(); champQuestion.value = b.dataset.base; envoyerQuestion({ nouvelle: true }); });
  listeQuestions.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { fermerListeQuestions(); ouvrirGardee(b.dataset.id); });
  listeQuestions.querySelectorAll('[data-oublier]').forEach((b) => b.onclick = async () => {
    try { etatQuestion.gardees = (await (await fetch('/api/questions', { method: 'DELETE', headers: enteteServeur(), body: JSON.stringify({ id: b.dataset.oublier }) })).json()).questions || []; } catch {}
    afficherListeQuestions();
    champQuestion.focus();
  });
}
function fermerListeQuestions() { listeQuestions.hidden = true; $('#ask').classList.remove('liste-ouverte'); }

async function ouvrirGardee(id) {
  try {
    const r = await fetch(`/api/questions?id=${encodeURIComponent(id)}`, { headers: enteteServeur() });
    if (!r.ok) throw new Error('Cette réponse n’existe plus.');
    const brut = await r.json();
    etatQuestion.session = null;
    etatQuestion.reprise = { question: brut.question, answer: brut.answer };
    montrerReponse(brut, brut.question);
  } catch (e) { montrerEchec('Réponse gardée', 'cli_error', e.message); chargerQuestions(); }
}

/** En tête d'une réponse gardée : sa date, et si le code a changé depuis. Reposer la question coûte des jetons, c'est dit sur le bouton. */
function banniereGardee(g) {
  const date = new Date(g.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const bouton = `<button type="button" class="btn soft" data-act="reposer">${pictoI('spark')}Reposer la question</button>`;
  const n = g.changements?.length || 0;
  if (n) {
    const noms = g.changements.slice(0, 3).map((c) => `<code title="${h(c.p)} : ${h(c.etat)}">${h(c.p.split('/').pop())}</code>`).join(', ');
    return `<div class="garde perimee"><p>Le code a changé depuis cette réponse du ${h(date)} (${n === 1 ? '1 fichier' : `${n} fichiers`} : ${noms}${n > 3 ? ` et ${n - 3} autre${n > 4 ? 's' : ''}` : ''}). Elle n’est peut-être plus à jour.</p>${bouton}</div>`;
  }
  const note = g.surveilles ? 'aucun jeton utilisé' : 'aucun jeton utilisé ; elle ne s’appuie sur aucun fichier précis, impossible de dire si elle est encore à jour';
  return `<div class="garde"><p>Réponse du ${h(date)}, gardée : ${note}.</p>${bouton}</div>`;
}
function reposerQuestion(a) {
  const g = a.garde;
  etatQuestion.context = [];
  champQuestion.value = a.question;
  const invite = g.invite || (g.suiteDe ? `Question précédente : « ${g.suiteDe} »\n\nNouvelle question : ${a.question}` : a.question);
  envoyerQuestion({ rafraichir: true, nouvelle: true, invite, contexte: g.contexte || [], suiteDe: g.suiteDe });
}

champQuestion.addEventListener('focus', () => { if (window.LA_CARTE_SERVER && !COPIE_EXPORTEE) afficherListeQuestions(); });
champQuestion.addEventListener('input', () => { if (window.LA_CARTE_SERVER && !COPIE_EXPORTEE) afficherListeQuestions(); });
champQuestion.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !listeQuestions.hidden) { ev.stopPropagation(); fermerListeQuestions(); }
  if (ev.key === 'ArrowUp' && !listeQuestions.hidden) { ev.preventDefault(); [...listeQuestions.querySelectorAll('.al-q')].pop()?.focus(); }
});
listeQuestions.addEventListener('keydown', (ev) => {
  const boutons = [...listeQuestions.querySelectorAll('.al-q')], i = boutons.indexOf(document.activeElement);
  if (ev.key === 'Escape') { fermerListeQuestions(); champQuestion.focus(); }
  if (ev.key === 'ArrowDown') { ev.preventDefault(); (boutons[i + 1] || champQuestion).focus(); }
  if (ev.key === 'ArrowUp' && i > 0) { ev.preventDefault(); boutons[i - 1].focus(); }
});
document.addEventListener('pointerdown', (ev) => { if (!listeQuestions.hidden && !$('#ask').contains(ev.target)) fermerListeQuestions(); });
$('#ask').addEventListener('focusout', (ev) => { if (!listeQuestions.hidden && !$('#ask').contains(ev.relatedTarget)) fermerListeQuestions(); });
if (!COPIE_EXPORTEE && window.LA_CARTE_SERVER) chargerQuestions();
