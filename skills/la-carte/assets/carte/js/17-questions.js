// ======================= demander (Claude Code en ligne de commande ou Codex via serveur.mjs, ou l'application Claude) =======================
const Q = creerRequetesGraphe(G);
const etatQuestion = { engine: null, sample: null, busy: false, ctl: null, session: null, turns: [], last: null };
const champQuestion = $('#ask-input'), boutonEnvoyer = $('#ask-send'), feuille = $('#ask-sheet'), alerte = $('#ask-warn');
const DOC_INSTALLATION = 'https://docs.claude.com/en/docs/claude-code/overview'; // le conseil de l'application Claude : installer la ligne de commande
const AVERTISSEMENTS = {
  no_engine: `Pour poser une question, il faut <b>${AGENT.cli}</b>. Depuis la racine du projet, lance <code>node la-carte/serveur.mjs</code>${AGENT.id === 'claude' ? ', ou ouvre cette carte dans l\'application Claude' : ''}.`,
  cli_missing: `Il faut que <b>${AGENT.cli}</b> soit installé pour que ça marche. <a href="${AGENT.docs}" target="_blank" rel="noopener">Installe-le</a>, puis relance <code>serveur.mjs</code>.`,
  not_logged_in: `${Maj(AGENT.cli)} n'est pas connecté. ${AGENT.signIn}`,
  app_unavailable: `Claude n'est pas disponible pour cette carte dans cette vue.`,
  not_granted: `L'accès de Claude à cette carte a été refusé. Recharge la page pour qu'on te le redemande.`,
  cli_tip: `Installe <b>Claude Code en ligne de commande</b> pour une meilleure expérience : il peut lire ton code source, pas seulement cette carte. <a href="${DOC_INSTALLATION}" target="_blank" rel="noopener">Installe-le</a>, puis lance <code>node la-carte/serveur.mjs</code> dans le projet.`,
};
function reglerAvertissement(code) {
  alerte.hidden = !code;
  alerte.classList.toggle('info', code === 'cli_tip');
  if (!code) return;
  alerte.innerHTML = `<svg class="i" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>${AVERTISSEMENTS[code] || h(code)}</span>${code === 'no_engine' ? '<button type="button" data-copycmd>Copier la commande</button>' : code === 'cli_tip' ? '<button type="button" data-dismiss>Compris</button>' : ''}`;
  alerte.querySelector('[data-dismiss]')?.addEventListener('click', () => reglerAvertissement(null));
  alerte.querySelector('[data-copycmd]')?.addEventListener('click', (e) => { navigator.clipboard?.writeText('node la-carte/serveur.mjs'); e.target.textContent = 'Copié'; });
}
function reglerMoteur(moteur, libelle, avertissement) {
  etatQuestion.engine = moteur;
  const balise = $('#ask-engine');
  balise.className = 'engine ' + (moteur ? 'ok' : 'warn');
  balise.innerHTML = `<i></i>${h(moteur ? libelle : 'Indisponible')}${moteur === 'app' ? `<button type="button" class="einfo" title="Installe Claude Code en ligne de commande pour une meilleure expérience" aria-label="À propos de Claude Code en ligne de commande"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button>` : ''}`;
  balise.querySelector('.einfo')?.addEventListener('click', () => reglerAvertissement(alerte.hidden || !alerte.classList.contains('info') ? 'cli_tip' : null));
  balise.title = moteur === 'cli' ? `Les réponses viennent de ${AGENT.cli} sur cet ordinateur, qui peut lire le code source` : moteur === 'app' ? 'Les réponses viennent de Claude dans l\'application Claude, à partir de la carte (pas des fichiers source)' : '';
  champQuestion.disabled = !moteur;
  boutonEnvoyer.disabled = !moteur;
  champQuestion.placeholder = moteur ? (petitEcran() ? 'Pose une question…' : `Pose une question sur ${G.projet.name}…`) : 'Questions indisponibles';
  if (typeof afficherPuces === 'function' && etatQuestion.context) afficherPuces();
  reglerAvertissement(avertissement || null);
  ajouterBasculeMode();
}
async function detecterMoteur() {
  const S = window.LA_CARTE_SERVER;
  if (S) { S.cli ? reglerMoteur('cli', AGENT.app + (S.model ? ' · ' + S.model : '')) : reglerMoteur(null, null, 'cli_missing'); return; }
  if (window.claude?.use) {
    reglerMoteur(null, null); $('#ask-engine').innerHTML = '<i></i>connexion…';
    let echantillon = null;
    try { echantillon = await window.claude.use('sample'); } catch {}
    const limites = echantillon ? await echantillon.limits().catch(() => null) : null;
    if (echantillon && limites?.tools) { etatQuestion.sample = echantillon; reglerMoteur('app', 'Claude'); return; }
    reglerMoteur(null, null, 'app_unavailable');
    return;
  }
  reglerMoteur(null, null, 'no_engine');
}

// mini markdown : paragraphes, listes, **gras**, `code`, références [[id]]
function pastilleRef(id) {
  const b = Q.brief(id);
  if (!b) return h(id);
  const ii = infosBloc(id);
  return `<span class="ref" data-ref="${h(id)}" style="--c:${couleurBloc(ii)}"><i></i>${h(b.name)}</span>`;
}
function md(src) {
  const enLigne = (s) => h(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[\[([^\]]+)\]\]/g, (_, id) => pastilleRef(id.replace(/&#39;|&quot;/g, '').trim()));
  const sortie = [];
  let liste = null;
  for (const brut of String(src || '').split('\n')) {
    const ligne = brut.trim();
    const li = /^([-*]|\d+\.)\s+(.*)$/.exec(ligne);
    if (li) { const balise = /\d/.test(li[1]) ? 'ol' : 'ul'; if (liste !== balise) { if (liste) sortie.push(`</${liste}>`); sortie.push(`<${balise}>`); liste = balise; } sortie.push(`<li>${enLigne(li[2])}</li>`); continue; }
    if (liste) { sortie.push(`</${liste}>`); liste = null; }
    if (ligne) sortie.push(`<p>${enLigne(ligne.replace(/^#+\s*/, ''))}</p>`);
  }
  if (liste) sortie.push(`</${liste}>`);
  return sortie.join('');
}

function afficherFeuille(question, corps) {
  feuille.hidden = false;
  feuille.innerHTML = `<div class="sh"><span class="q" title="${h(question)}">${h(question)}</span>
    ${etatQuestion.last && etatVue.container !== 'q:answer' ? '<button class="btn soft" data-act="board">Afficher le tableau de réponse</button>' : ''}
    ${etatVue.container === 'q:answer' ? '<button class="btn soft" data-act="map">Retour à la carte</button>' : ''}
    <button class="btn icon" data-act="close" title="Fermer">${pictoI('x')}</button></div><div class="sb">${corps}</div>`;
  feuille.querySelector('[data-act="close"]').onclick = () => { if (etatQuestion.busy) annulerQuestion(); feuille.hidden = true; if (etatVue.container === 'q:answer') allerVers('root'); else ajusterVue(true); };
  feuille.querySelector('[data-act="map"]')?.addEventListener('click', () => allerVers('root'));
  feuille.querySelector('[data-act="board"]')?.addEventListener('click', () => allerVers('q:answer'));
  feuille.querySelectorAll('[data-ref]').forEach((r) => r.onclick = () => {
    const id = r.dataset.ref;
    if (etatVue.container === 'q:answer' && etatVue.view.visible.includes(id)) { choisir(id); centrerSur(id); } else localiser(id);
  });
  feuille.querySelectorAll('[data-follow]').forEach((b) => b.onclick = () => { champQuestion.value = b.dataset.follow; envoyerQuestion(); });
  feuille.querySelector('[data-act="steps"]')?.addEventListener('click', () => {
    const a = etatQuestion.last;
    etatVue.flow = { f: { title: a.title, steps: a.steps.map((s) => ({ ref: s.id, note: s.note })) }, i: 0, inPlace: true };
    etapeParcours();
  });
}
function montrerProgression(question, lignes) {
  afficherFeuille(question, `<div class="progress">${lignes.map((l, i) => `<div>${i === lignes.length - 1 ? '<span class="spin"></span>' : '<span style="width:12px;display:inline-block;text-align:center">✓</span>'}${h(l)}</div>`).join('')}</div>`);
}
function afficherReponse(a) {
  const etapes = a.steps?.length >= 2;
  afficherFeuille(a.question, `${md(a.answer)}
    <div class="sheet-actions">${etapes ? `<button class="btn soft" data-act="steps">${pictoI('right')}Suivre les ${a.steps.length} étapes</button>` : ''}</div>
    ${a.followups?.length ? `<div class="followups">${a.followups.slice(0, 3).map((f) => `<button data-follow="${h(f)}">${h(f)}</button>`).join('')}</div>` : ''}`);
}
function montrerReponse(brut, question) {
  const nettoyer = (arr) => (Array.isArray(arr) ? arr : []).map((x) => typeof x === 'string' ? { id: x, note: '' } : x).filter((x) => x && Q.exists(String(x.id))).map((x) => ({ id: String(x.id), note: String(x.note || '') }));
  const elements = nettoyer(brut.items);
  const etapes = nettoyer(brut.steps);
  for (const s of etapes) if (!elements.some((x) => x.id === s.id)) elements.push({ id: s.id, note: s.note });
  const a = { title: String(brut.title || 'Réponse'), answer: String(brut.answer || ''), items: elements.slice(0, 18), steps: etapes, followups: (brut.followups || []).map(String), question };
  etatQuestion.last = a;
  if (a.items.length) { etatVue.answer = a; allerVers('q:answer', { force: true, after: () => afficherReponse(a) }); }
  else afficherReponse(a);
}
function montrerEchec(question, code, message, partiel) {
  if (code === 'not_logged_in' || code === 'not_granted') reglerAvertissement(code);
  if (code === 'not_granted' || code === 'sampling_disabled') reglerMoteur(null, null, code === 'not_granted' ? 'not_granted' : 'app_unavailable');
  if (code === 'cancelled') { feuille.hidden = true; return; }
  const texteErreur = { rate_limited: `${AGENT.name} est occupé ou tu as atteint une limite d'utilisation. Réessaie dans un moment.`, not_logged_in: `${Maj(AGENT.cli)} a besoin que tu te connectes d'abord.`, cli_missing: `${Maj(AGENT.cli)} est introuvable.`, invalid_json: `La réponse de ${AGENT.name} n'a pas pu être lue comme une vue de la carte. Essaie de reformuler.`, session_expired: `Ta session ${AGENT.name} a expiré. Connecte-toi à nouveau.` }[code];
  afficherFeuille(question, `<p class="err">${h(texteErreur || message || 'Un problème est survenu.')}</p>${partiel ? md(partiel) : ''}${code === 'cli_error' && message ? `<p style="font-family:var(--mono);font-size:11px;color:var(--text-3)">${h(message.slice(0, 400))}</p>` : ''}`);
}
function reglerOccupe(b) {
  etatQuestion.busy = b;
  boutonEnvoyer.classList.toggle('stop', b);
  boutonEnvoyer.innerHTML = b ? `<svg class="i" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>` : `<svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
  boutonEnvoyer.title = b ? 'Arrêter' : 'Demander';
}
function annulerQuestion() {
  etatQuestion.ctl?.abort();
  if (etatQuestion.engine === 'cli') fetch('/api/cancel', { method: 'POST', headers: { 'x-la-carte-token': window.LA_CARTE_SERVER.token } }).catch(() => {});
}

// ---------- modifier un plan depuis la carte (servi par serveur.mjs) ----------
// La bulle de questions reçoit un interrupteur Demander / Modifier. Une modification part vers l'agent, le serveur vérifie et enregistre le
// plan mis à jour et redessine la carte, chaque onglet ouvert se recharge, et les blocs nouveaux et modifiés sont mis en valeur
// comme travail récent. Ce qui a changé est gardé pendant ce rechargement dans sessionStorage, avec un bouton Annuler.
const CLE_CHANGEMENT = 'la-carte-change';
// un serveur dont le moteur ne peut pas respecter le format du plan répond change: false
const changementPossible = () => PLAN && etatQuestion.engine === 'cli' && window.LA_CARTE_SERVER?.change !== false;
function reglerModeQuestion(m) {
  etatQuestion.mode = changementPossible() && m === 'change' ? 'change' : 'ask';
  $('#ask-mode')?.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.m === etatQuestion.mode); b.setAttribute('aria-pressed', String(b.dataset.m === etatQuestion.mode)); });
  if (etatQuestion.engine) champQuestion.placeholder = etatQuestion.mode === 'change' ? 'Demande une modification, par ex. « prévois aussi les remboursements »…' : (petitEcran() ? 'Pose une question…' : `Pose une question sur ${G.projet.name}…`);
  boutonEnvoyer.title = etatQuestion.busy ? 'Arrêter' : etatQuestion.mode === 'change' ? 'Faire cette modification' : 'Demander';
}
function ajouterBasculeMode() {
  if (!changementPossible() || $('#ask-mode')) return;
  const sw = document.createElement('span');
  sw.id = 'ask-mode';
  sw.innerHTML = '<button type="button" data-m="ask" title="Poser une question sur le plan">Demander</button><button type="button" data-m="change" title="Demander une modification, un ajout ou un retrait, et la carte est redessinée">Modifier</button>';
  sw.querySelectorAll('button').forEach((b) => b.onclick = () => { reglerModeQuestion(b.dataset.m); champQuestion.focus(); });
  $('#ask-form').prepend(sw);
  reglerModeQuestion('ask');
}
const memoireChangement = { get: () => { try { return JSON.parse(sessionStorage.getItem(CLE_CHANGEMENT) || 'null'); } catch { return null; } }, set: (v) => { try { v ? sessionStorage.setItem(CLE_CHANGEMENT, JSON.stringify(v)) : sessionStorage.removeItem(CLE_CHANGEMENT); } catch {} } };
async function demanderChangement(question) {
  reglerOccupe(true);
  etatQuestion.ctl = new AbortController();
  const lignes = ['Lecture du plan…'];
  const progression = (t) => { lignes.push(t); montrerProgression(question, lignes.slice(-6)); };
  montrerProgression(question, lignes);
  try {
    const r = await demanderViaCli(question, progression, 'change');
    memoireChangement.set({ question, title: r.title, summary: r.summary, followups: r.followups || [], undo: r.undo, at: Date.now() });
    progression('Redessin de la carte');
    setTimeout(() => location.reload(), 4000); // au cas où l'avis de rechargement n'arrive pas
  } catch (e) {
    if (e?.name === 'AbortError') montrerEchec(question, 'cancelled');
    else if (e?.code === 'change_invalid' || e?.code === 'busy') afficherFeuille(question, `<p class="err">${h(String(e.message).split('\n')[0])}</p>${md(String(e.message).split('\n').slice(1).join('\n'))}`);
    else montrerEchec(question, e?.code || 'upstream_error', e?.message || String(e));
  } finally { reglerOccupe(false); }
}
/** Après le rechargement que provoque une modification : ce qui a changé, avec Annuler et les blocs modifiés sur un seul tableau. */
function montrerResultatChangement() {
  const c = memoireChangement.get();
  memoireChangement.set(null);
  if (!c) return;
  if (c.undone) { afficherMessage('Modification annulée'); return; }
  if (Date.now() - c.at > 120000) return;
  const elements = (G.recent?.items || []).filter((x) => parentsParId.has(x.id)).map((x) => ({ id: x.id, note: x.note }));
  fermerFeuille(); // un bloc dans le lien ouvre la feuille de détails sur un téléphone, et elle se poserait par-dessus ce résumé
  afficherFeuille(c.question, `<p><strong>${h(c.title || 'Plan mis à jour')}</strong></p>${md(c.summary)}
    <div class="sheet-actions">${elements.length ? `<button class="btn soft" data-cr="show">${pictoI('search')}Voir ${accorder(elements.length, 'modification')}</button>` : ''}<button class="btn soft" data-cr="undo">${pictoI('left')}Annuler</button></div>
    ${c.followups?.length ? `<div class="followups">${c.followups.slice(0, 3).map((f) => `<button data-cf="${h(f)}">${h(f)}</button>`).join('')}</div>` : ''}`);
  feuille.querySelector('[data-cr="show"]')?.addEventListener('click', () => montrerVueReponse({ title: c.title || 'Ce qui a changé', question: c.question, items: elements }));
  feuille.querySelector('[data-cr="undo"]').addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const r = await fetch('/api/plan/undo', { method: 'POST', headers: { 'x-la-carte-token': window.LA_CARTE_SERVER.token } }).then((x) => x.json()).catch(() => ({ ok: false, error: 'Impossible de joindre le serveur de la carte.' }));
    if (!r.ok) { afficherMessage(r.error || 'Impossible d’annuler'); ev.currentTarget.disabled = false; return; }
    memoireChangement.set({ undone: true, at: Date.now() });
    setTimeout(() => location.reload(), 4000);
  });
  feuille.querySelectorAll('[data-cf]').forEach((b) => b.onclick = () => { reglerModeQuestion('change'); champQuestion.value = b.dataset.cf; envoyerQuestion(); });
}

async function demanderViaCli(question, progression, mode = 'ask') {
  const res = await fetch('/api/ask', {
    method: 'POST', signal: etatQuestion.ctl.signal,
    headers: { 'content-type': 'application/json', 'x-la-carte-token': window.LA_CARTE_SERVER.token },
    body: JSON.stringify({ question, mode, session: mode === 'ask' ? etatQuestion.session : undefined }),
  });
  if (!res.ok || !res.body) throw { code: 'cli_error', message: `Réponse du serveur : ${res.status}` };
  const lecteur = res.body.getReader(), dec = new TextDecoder();
  let tampon = '', reponse = null;
  for (;;) {
    const { value: valeur, done: fini } = await lecteur.read();
    if (fini) break;
    tampon += dec.decode(valeur, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, i); tampon = tampon.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(bloc)?.[1], donnees = JSON.parse(/^data: (.*)$/m.exec(bloc)?.[1] || 'null');
      if (ev === 'progress') progression(donnees.text);
      else if (ev === 'answer') { reponse = donnees; if (mode === 'ask') etatQuestion.session = donnees.session || etatQuestion.session; }
      else if (ev === 'failure') throw donnees;
    }
  }
  if (!reponse) throw { code: 'cli_error', message: 'La ligne de commande s\'est arrêtée sans réponse.' };
  return reponse;
}

async function demanderViaApp(question, progression, mode = 'ask') {
  const tronquer = (v) => { const s = JSON.stringify(v); return s.length > 24000 ? s.slice(0, 24000) + '…(tronqué)' : s; };
  const outils = [
    { name: 'find_items', description: 'Cherche dans la carte avec des mots. Renvoie jusqu\'à 15 éléments {id, type, name, description, path}. kind limite éventuellement les résultats à module, file, endpoint ou symbol.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['module', 'file', 'endpoint', 'symbol'] } }, required: ['query'] },
      execute: ({ query: requete, kind: genre }) => { progression(`Recherche dans la carte de « ${requete} »`); return tronquer(Q.find(String(requete), genre ? String(genre) : undefined)); } },
    { name: 'get_item', description: "Détails d'un élément de la carte à partir de son id : sa description, son module parent, ses enfants et fichiers, ses adresses du serveur (endpoints), ses exports, et ce dont il dépend et ce qui l'utilise (avec les ids).",
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: ({ id }) => { const b = Q.brief(String(id)); progression(`Examen de ${b ? b.name : id}`); return tronquer(Q.show(String(id))); } },
    { name: 'dependency_path', description: 'Plus courte chaîne d\'imports et d\'appels HTTP depuis n\'importe quoi à l\'intérieur d\'un élément jusqu\'à n\'importe quoi à l\'intérieur d\'un autre. Renvoie les étapes avec leurs ids.',
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      execute: ({ from: depuis, to: vers }) => { progression('Recherche d\'un chemin de dépendances'); return tronquer(Q.path(String(depuis), String(vers))); } },
  ];
  const estParcours = mode === 'flow';
  const consignes = `${estParcours ? laCarteConsignesParcours(G, 'app') : laCarteConsignesQuestion(G, 'app')}\nLe JSON doit respecter ce schéma :\n${JSON.stringify(estParcours ? LA_CARTE_SCHEMA_PARCOURS : LA_CARTE_SCHEMA_REPONSE)}\n\nAperçu de la carte :\n${tronquer(Q.overview())}`;
  const echanges = [{ role: 'user', content: consignes }, ...(estParcours ? [] : etatQuestion.turns.slice(-6)), { role: 'user', content: question }];
  const reponse = await etatQuestion.sample.json(echanges, { tools: outils, signal: etatQuestion.ctl.signal });
  if (estParcours) return reponse || {};
  etatQuestion.turns.push({ role: 'user', content: question }, { role: 'assistant', content: JSON.stringify({ title: reponse?.title, answer: reponse?.answer }) });
  return reponse || {};
}

etatQuestion.context = [];
/** Épingle un élément de la carte à la prochaine question (« Demander à ce sujet »). */
function epinglerContexte(id) {
  if (!Q.exists(id)) return;
  etatQuestion.context = [...etatQuestion.context.filter((x) => x !== id), id].slice(-3);
  afficherPuces();
  champQuestion.focus();
}
function afficherPuces() {
  const boite = $('#ask-chips');
  boite.innerHTML = etatQuestion.context.map((id) => { const i = infosBloc(id); return `<span class="chip" title="${h(i.path || '')}"><span class="ico" style="--c:${couleurBloc(i)}">${picto(clePicto(i))}</span><span>${h(i.name)}</span><button type="button" data-rm="${h(id)}" aria-label="Retirer">${pictoI('x')}</button></span>`; }).join('');
  boite.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { etatQuestion.context = etatQuestion.context.filter((x) => x !== b.dataset.rm); afficherPuces(); champQuestion.focus(); });
  champQuestion.placeholder = !etatQuestion.engine ? 'Questions indisponibles' : etatQuestion.mode === 'change' ? (etatQuestion.context.length ? 'Que faut-il changer ici ?' : 'Demande une modification, par ex. « prévois aussi les remboursements »…') : etatQuestion.context.length ? 'Pose une question à ce sujet…' : petitEcran() ? 'Pose une question…' : `Pose une question sur ${G.projet.name}…`;
  boutonEnvoyer.disabled = !etatQuestion.engine;
}
champQuestion.addEventListener('keydown', (ev) => { if (ev.key === 'Backspace' && !champQuestion.value && etatQuestion.context.length) { etatQuestion.context.pop(); afficherPuces(); } });

async function envoyerQuestion() {
  if (etatQuestion.busy) { annulerQuestion(); return; }
  const idsContexte = etatQuestion.context.slice();
  let question = champQuestion.value.trim();
  if (!question && idsContexte.length) question = idsContexte.length === 1 ? `Qu'est-ce que ${infosBloc(idsContexte[0]).name} et comment s'insère-t-il dans l'ensemble ?` : `Quel est le lien entre ${idsContexte.map((id) => infosBloc(id).name).join(' et ')} ?`;
  if (!question || !etatQuestion.engine) return;
  champQuestion.value = '';
  etatQuestion.context = []; afficherPuces();
  if (etatQuestion.mode === 'change') return demanderChangement(idsContexte.length ? `${question}\n\nCela concerne : ${idsContexte.map((id) => `${id} (${infosBloc(id).name})`).join(', ')}.` : question);
  const affiche = question;
  // ce que Claude voit : la question plus les éléments épinglés, par id, pour qu'il parte d'eux
  if (idsContexte.length) question += `\n\nConcentre-toi sur ces éléments de la carte : ${idsContexte.map((id) => `${id} (${infosBloc(id).name})`).join(', ')}.`;
  reglerOccupe(true);
  etatQuestion.ctl = new AbortController();
  const lignes = ['Réflexion…'];
  const progression = (t) => { lignes.push(t); montrerProgression(affiche, lignes.slice(-6)); };
  montrerProgression(affiche, lignes);
  try {
    const brut = etatQuestion.engine === 'cli' ? await demanderViaCli(question, progression) : await demanderViaApp(question, progression);
    montrerReponse(brut, affiche);
  } catch (e) {
    if (e?.name === 'AbortError') montrerEchec(affiche, 'cancelled');
    else montrerEchec(affiche, e?.code || 'upstream_error', e?.message || String(e), e?.text && e.code !== 'invalid_json' ? e.text : '');
  } finally { reglerOccupe(false); }
}
$('#ask-form').addEventListener('submit', (ev) => { ev.preventDefault(); envoyerQuestion(); });
boutonEnvoyer.addEventListener('click', (ev) => { if (etatQuestion.busy) { ev.preventDefault(); annulerQuestion(); } });
if (!COPIE_EXPORTEE) detecterMoteur();
afficherMenuParcours();
if (!COPIE_EXPORTEE) chargerParcoursPerso();

