// Extraction par langage, à base de regex : imports, symboles exportés, routes HTTP et appels HTTP.
// Volontairement approximatif : assez bon pour dessiner la carte, assez léger pour tourner sur n'importe quel dépôt.

const indexLignes = (source) => {
  const debuts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) debuts.push(i + 1);
  return (decalage) => {
    let bas = 0, haut = debuts.length - 1;
    while (bas < haut) { const milieu = (bas + haut + 1) >> 1; if (debuts[milieu] <= decalage) bas = milieu; else haut = milieu - 1; }
    return bas + 1;
  };
};

const vider = (s) => s.replace(/[^\n]/g, ' ');
// Retire les commentaires en gardant les positions (pour que les numéros de ligne restent justes). Les chaînes sont sautées, donc un
// '/*' dans une chaîne (app.use('/api/*', cors())) ne démarre pas un commentaire qui avalerait le code qui suit.
const retirerCommentairesC = (source) => {
  let sortie = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') {
      // les guillemets s'arrêtent en fin de ligne, les accents graves (backticks) peuvent couvrir plusieurs lignes
      let j = i + 1;
      while (j < source.length && source[j] !== c && (c === '`' || source[j] !== '\n')) j += source[j] === '\\' ? 2 : 1;
      sortie += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    let fin = -1;
    if (c === '/' && source[i + 1] === '*') { fin = source.indexOf('*/', i + 2); if (fin >= 0) fin += 2; }
    else if (c === '/' && source[i + 1] === '/' && !/[:\\]/.test(source[i - 1] || '')) { fin = source.indexOf('\n', i); if (fin < 0) fin = source.length; }
    if (fin >= 0) { sortie += vider(source.slice(i, fin)); i = fin; continue; }
    sortie += c;
    i++;
  }
  return sortie;
};
const retirerCommentairesDiese = (source) => source.replace(/(^|\s)#[^\n]*/g, (m, espaceAvant) => espaceAvant + vider(m.slice(espaceAvant.length)));

const tout = (regex, s) => [...s.matchAll(regex)];

// ---------- tables de routes indexées par "MÉTHODE /chemin" ----------

// Les serveurs sans framework rangent souvent leurs adresses dans une table indexée par méthode et chemin, et
// un répartiteur choisit le gestionnaire : { "GET /api/orders": listOrders } en JS, ou
// { "POST /v1/claim": claim_draft, "GET /v1/paths/{slug}": lambda e, s: get_path(s, e) } en Python.
// Il n'y a aucun app.get(...) à trouver, donc ces clés sont les adresses du serveur. Une valeur compte quand elle nomme une
// fonction (`listOrders`, `oauth.register`), est une courte fonction en ligne qui en appelle une, ou en enveloppe une
// (`requireAuth(listOrders)`). Les tables d'autre chose indexées de la même façon (niveaux d'accès, docs, codes d'état,
// constantes EN_MAJUSCULES) sont laissées de côté, et un fichier a besoin de deux entrées de ce genre pour qu'elles comptent.
const CLE_TABLE = /^[ \t]*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY|ALL)[ \t]+(\/[^"'`\s]*)["'`][ \t]*:[ \t]*([^\n]*)/gm;
const PAS_UN_GESTIONNAIRE = /^(?:[A-Z][A-Z0-9_]*|true|false|null|undefined|None|True|False|await|new|return|lambda|function|async)$/;

function gestionnaireTable(brut) {
  const v = brut.trim().replace(/,\s*$/, '').trim();
  const dernier = (pointe) => pointe.split('.').pop();
  const reference = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.exec(v);
  if (reference) return PAS_UN_GESTIONNAIRE.test(dernier(v)) ? null : { handler: dernier(v) };
  // lambda e, s: get_path(s, e)  ·  (req) => getPath(req)  ·  async function (req) { return getPath(req) }
  const enLigne = /^(?:lambda\b[^:]*:|(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|(?:async\s+)?function\b[^{]*\{)([\s\S]*)$/.exec(v);
  if (enLigne) {
    const appel = [...enLigne[1].matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)].map((m) => dernier(m[1])).find((n) => !PAS_UN_GESTIONNAIRE.test(n));
    return { handler: appel || null };
  }
  // requireAuth(listOrders), login_required(views.orders): la fonction enveloppée est le gestionnaire
  const enveloppe = /^[A-Za-z_$][\w$.]*\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[,)]/.exec(v);
  if (enveloppe && !PAS_UN_GESTIONNAIRE.test(dernier(enveloppe[1]))) return { handler: dernier(enveloppe[1]) };
  return null; // une chaîne, un nombre, un objet, une liste, ou un appel sur une constante : ce n'est pas une table de routes
}

function tableRoutesParCle(code, ligneDe) {
  const sortie = [];
  for (const m of tout(CLE_TABLE, code)) {
    const h = gestionnaireTable(m[3]);
    if (!h) continue;
    const methode = m[1] === 'ALL' ? 'ANY' : m[1];
    sortie.push({ method: methode, path: m[2], var: null, line: ligneDe(m.index), framework: 'table', ...(h.handler ? { handler: h.handler } : {}) });
  }
  return sortie.length >= 2 ? sortie : [];
}

// ---------- littéraux d'appels HTTP ----------

const CONTEXTE_HTTP = /\b(fetch|axios|ky|got|request|requests|httpx|aiohttp|session|client|http|https|api|Api|API|endpoint|Endpoint|url|Url|URL|BASE|base)\b|\.(get|post|put|patch|delete|head)\s*(<[^>]*>)?\s*\(|(?<![.\w$])(get|post|put|patch|delete)\s*\(\s*[rf]?["'`]\//;
const CONTEXTE_NAVIGATION = /\b(router\.(push|replace|prefetch)|navigate|redirect|href|revalidatePath|pathname|Link|to=|location\.)\b|window\.location/;
const LITTERAL_CHAINE = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const HOTE_IGNORE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$|\.(test|example|invalid|local|localhost|internal)(:\d+)?$|(^|\.)example\.(com|org|net)$/;
const FIN_EXT_FICHIER = /\.(png|jpe?g|gif|svg|ico|webp|css|js|mjs|ts|tsx|json|html?|txt|md|pdf|csv|xml|woff2?|ttf|map)$/i;

function normaliserLitteralAppel(brut) {
  let s = brut.trim();
  let hote = null;
  // l'adresse propre d'une fonction Firebase (https://us-central1-<project>.cloudfunctions.net/signDocument) est
  // le back de cette appli, pas un service extérieur
  const fonction = /^https?:\/\/[^/\s]*\.cloudfunctions\.net(\/.*)$/i.exec(s);
  if (fonction) s = fonction[1];
  const absolu = /^https?:\/\/([^/${}\s]+)(.*)$/i.exec(s);
  // user:password@ est retiré : seul le nom du site est gardé
  if (absolu) { hote = absolu[1].toLowerCase().replace(/^.*@/, ''); s = absolu[2] || '/'; }
  // interpolations au début : ${API_BASE}/x, {BASE_URL}/x
  s = s.replace(/^(?:\$\{[^}]*\}|\{[^}]*\})+/, '');
  if (!s.startsWith('/')) return null;
  s = s.split(/[?#]/)[0];
  // une chaîne de requête collée directement au dernier segment : `/cost-lots${qs}`, `/items{query}`
  s = s.replace(/([A-Za-z0-9_\-])(?:\$\{[^}]*\}|\{[^}]*\})+$/, '$1');
  if (!/^\/[\w\-.~%/*${}:@<>\[\]]*$/.test(s)) return null;
  if (FIN_EXT_FICHIER.test(s)) return null;
  if (!/[a-zA-Z]{2,}/.test(s.replace(/\$\{[^}]*\}|\{[^}]*\}/g, ''))) return hote ? { host: hote, path: null } : null;
  return { host: hote, path: s };
}

/**
 * Réduit chaque ${…} à l'intérieur des gabarits (template literals) en ${x}, en comptant les accolades, pour que des gabarits imbriqués comme
 * `/orders${q ? `?${q}` : ''}` se lisent comme un seul littéral "/orders${x}" au lieu de se casser au backtick intérieur.
 */
export function aplatirGabarits(ligne) {
  let sortie = '', dansGabarit = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '\\') { sortie += c + (ligne[i + 1] ?? ''); i++; continue; }
    if (c === '`') { dansGabarit = !dansGabarit; sortie += c; continue; }
    if (dansGabarit && c === '$' && ligne[i + 1] === '{') {
      let profondeur = 1, j = i + 2;
      for (; j < ligne.length && profondeur; j++) { if (ligne[j] === '{') profondeur++; else if (ligne[j] === '}') profondeur--; }
      sortie += '${x}'; i = j - 1; continue;
    }
    sortie += c;
  }
  return sortie;
}

// `api.post(…)`, ou une aide seule importée d'un client d'API : `post("/orders", …)`
const APPEL_METHODE = /(?:\.|(?<![\w$])(?=(?:get|post|put|patch|delete)\s*\(\s*[rf]?["'`]\/))(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(/i;
const OPTION_METHODE = /method\s*[:=]\s*["'`](\w+)/i;
// `const url = …`, `url = f"…"`, `this.endpoint = …` : une URL gardée dans une variable pour l'appel qui suit
const AFFECTATION = /(?:\b(?:const|let|var)\s+|^\s*(?:self\.|this\.)?)([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>[\]|. ]+?\s*)?=(?![=>])/;
/** Où une variable est passée à un appel HTTP dans les quelques lignes qui suivent, et avec quelle méthode. */
function usageVariable(lignes, i, nom) {
  const usage = new RegExp(`(?:\\.(get|post|put|patch|delete|head|request)\\s*(?:<[^>]*>)?\\s*\\(|\\b(?:fetch|axios|ky|got|request|urlopen)\\s*\\(|\\brequests\\.(get|post|put|patch|delete)\\s*\\()\\s*${nom}\\b`, 'i');
  for (let j = i + 1; j < Math.min(lignes.length, i + 10); j++) {
    const m = usage.exec(lignes[j]);
    if (!m) continue;
    const verbe = (m[1] && m[1].toLowerCase() !== 'request' ? m[1] : m[2]) || OPTION_METHODE.exec(lignes.slice(j, j + 4).join(' '))?.[1] || '';
    return { method: verbe.toUpperCase() || null };
  }
  return null;
}

function extraireAppels(source, ligneDe, { skip: sauter } = {}) {
  const appels = [];
  const hotes = [];
  const lignes = source.split('\n');
  let decalage = 0;
  for (let i = 0; i < lignes.length; i++) {
    const ligne = aplatirGabarits(lignes[i]);
    const debutLigne = decalage;
    decalage += lignes[i].length + 1;
    if (ligne.length > 500 || CONTEXTE_NAVIGATION.test(ligne)) continue;
    if (sauter && sauter.test(ligne)) continue;
    // une URL mise dans une variable compte quand un appel HTTP plus bas utilise cette variable
    const affecte = AFFECTATION.exec(ligne)?.[1];
    const usage = affecte ? usageVariable(lignes, i, affecte) : null;
    if (!CONTEXTE_HTTP.test(ligne) && !usage) continue;
    const methode = (APPEL_METHODE.exec(ligne)?.[1] || OPTION_METHODE.exec(ligne)?.[1] || usage?.method || '').toUpperCase() || null;
    for (const m of ligne.matchAll(LITTERAL_CHAINE)) {
      const n = normaliserLitteralAppel(m[2]);
      if (!n) continue;
      const numLigne = ligneDe(debutLigne);
      if (n.host && !HOTE_IGNORE.test(n.host) &&!n.host.includes('${') && !n.host.includes('{')) hotes.push({ host: n.host, line: numLigne });
      if (n.path && !n.host) appels.push({ path: n.path, method: methode, line: numLigne });
    }
  }
  return { calls: appels, hosts: hotes };
}

// ---------- JS / TS ----------

/** Les noms importés et leurs noms locaux : `import users, { a as b } from` → locals { users: 'default', b: 'a' }. */
function lireClauseImport(clause) {
  const noms = [];
  const locaux = {};
  const c = clause.replace(/^type\s+/, '').trim();
  const accolade = /\{([^}]*)\}/.exec(c);
  if (accolade) for (const morceau of accolade[1].split(',')) {
    const [origine, pseudo] = morceau.trim().replace(/^type\s+/, '').split(/\s+as\s+/).map((s) => s?.trim());
    if (origine) { noms.push(origine); locaux[pseudo || origine] = origine; }
  }
  const tete = c.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  const espaceNoms = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(tete);
  if (espaceNoms) locaux[espaceNoms[1]] = '*';
  const definition = /^([A-Za-z_$][\w$]*)/.exec(tete);
  if (definition && definition[1] !== 'as') { noms.push('default'); locaux[definition[1]] = 'default'; }
  return { names: noms, locals: locaux };
}

function extraireJs(source, cheminFichier) {
  const code = retirerCommentairesC(source);
  const ligneDe = indexLignes(code);
  const imports = [];
  for (const m of tout(/(?:^|[;\n}])\s*import\s+(?!\()((?:type\s+)?[^'";]*?)\s+from\s+["']([^"'\n]+)["']/g, code)) imports.push({ spec: m[2], ...lireClauseImport(m[1]), line: ligneDe(m.index) });
  for (const m of tout(/(?:^|[;\n])\s*import\s+["']([^"'\n]+)["']/g, code)) imports.push({ spec: m[1], names: [], line: ligneDe(m.index) });
  for (const m of tout(/\bexport\s+(?:type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g, code)) {
    // `export { a as b } from` → exported { b: 'a' }, les noms que ce fichier transmet
    const clause = m[1].startsWith('{') ? lireClauseImport(m[1]) : null;
    imports.push({ spec: m[2], names: clause ? clause.names : [], ...(clause ? { exported: clause.locals } : {}), line: ligneDe(m.index), reexport: true });
  }
  for (const m of tout(/\brequire\(\s*["']([^"'\n]+)["']\s*\)/g, code)) {
    // `const usersRouter = require('./users')` / `const { a, b: c } = require(…)` donnent des noms locaux
    const avant = code.slice(code.lastIndexOf('\n', m.index) + 1, m.index);
    const liaison = /(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?$/.exec(avant);
    const locaux = {};
    if (liaison?.[1].startsWith('{')) for (const morceau of liaison[1].slice(1, -1).split(',')) { const [origine, pseudo] = morceau.trim().split(/\s*:\s*/); if (origine) locaux[(pseudo || origine).trim()] = origine.trim(); }
    else if (liaison) locaux[liaison[1]] = 'default';
    imports.push({ spec: m[1], names: Object.values(locaux), locals: locaux, line: ligneDe(m.index) });
  }
  for (const m of tout(/\bimport\(\s*["']([^"'\n]+)["']\s*\)/g, code)) imports.push({ spec: m[1], names: [], line: ligneDe(m.index), dynamic: true });

  const symboles = [];
  const vus = new Set();
  const ajouterSymbole = (nom, genre, indice, parDefaut) => {
    const cle = nom + (parDefaut ? '#d' : '');
    if (vus.has(cle)) return;
    vus.add(cle);
    symboles.push({ name: nom, kind: genre, line: ligneDe(indice), ...(parDefaut ? { default: true } : {}) });
  };
  for (const m of tout(/^[ \t]*export\s+(default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm, code)) {
    const genre = m[2].startsWith('function') ? 'function' : ['const', 'let', 'var'].includes(m[2]) ? 'const' : m[2];
    ajouterSymbole(m[3], genre, m.index, !!m[1]);
  }
  for (const m of tout(/^[ \t]*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm, code)) {
    if (!['function', 'class', 'async'].includes(m[1])) ajouterSymbole(m[1], 'default', m.index, true);
  }
  for (const m of tout(/^[ \t]*export\s*\{([^}]*)\}\s*;?\s*$/gm, code)) {
    for (const morceau of m[1].split(',')) {
      const [origine, pseudo] = morceau.trim().split(/\s+as\s+/);
      if (origine) ajouterSymbole((pseudo || origine).trim(), 'export', m.index, (pseudo || '').trim() === 'default');
    }
  }
  // Gestionnaires de routes Next.js / exports de module
  for (const m of tout(/^[ \t]*module\.exports\s*=\s*([A-Za-z_$][\w$]*)?/gm, code)) ajouterSymbole(m[1] || 'module.exports', 'default', m.index, true);

  // Routes et montages dans le style Express / Koa / Hono
  const routes = [];
  const montages = [];
  for (const m of tout(/\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all|options|head)\(\s*["'`](\/[^"'`]*)["'`]/g, code)) {
    if (!/^(app|server|fastify|hono|routes?|[a-z]*Router|router)$/.test(m[1])) continue;
    routes.push({ method: m[2].toUpperCase(), path: m[3], var: m[1], line: ligneDe(m.index) });
  }
  for (const m of tout(/\b([A-Za-z_$][\w$]*)\.(use|route)\(\s*["'`](\/[^"'`]*)["'`]\s*,([^\n;]*)/g, code)) {
    const requete = /require\(\s*["']([^"']+)["']\s*\)/.exec(m[4]);
    const intergiciels = (m[4].split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z_$][w$.]*$/.test(s))).map((s) => s.split('.').pop());
    if (requete) { montages.push({ prefix: m[3], spec: requete[1], line: ligneDe(m.index), ...(intergiciels.length ? { mw: intergiciels } : {}) }); continue; }
    const argumentsAppel = m[4].replace(/\)\s*$/, '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z_$][\w$.]*$/.test(s));
    if (argumentsAppel.length) montages.push({ prefix: m[3], var: argumentsAppel[argumentsAppel.length - 1], line: ligneDe(m.index), ...(argumentsAppel.length > 1 ? { mw: argumentsAppel.slice(0, -1).map((s) => s.split('.').pop()) } : {}) });
  }
  // Plugins Fastify : app.register(ticketRoutes, { prefix: '/api/tickets' }), ou register(import('./x.js'), …).
  // Un plugin enregistré sans préfixe reste sous celui de son parent : c'est donc un montage avec un préfixe vide.
  // Seul un plugin importé compte : un plugin défini dans ce fichier mettrait son préfixe sur toutes les routes d'ici.
  for (const m of tout(/\.register\(\s*(?:await\s+)?(?:(?:import|require)\(\s*["']([^"'\n]+)["']\s*\)|([A-Za-z_$][\w$]*))\s*(?:,\s*\{([^{}]*)\}\s*)?\)/g, code)) {
    const options = m[3] || '';
    const prefixe = /\bprefix\s*:\s*["'`](\/[^"'`$]*)["'`]/.exec(options)?.[1] ?? (/\bprefix\s*:/.test(options) ? null : '');
    if (prefixe == null) continue;
    if (m[1]) montages.push({ prefix: prefixe, spec: m[1], line: ligneDe(m.index) });
    else if (imports.some((i) => i.locals && Object.hasOwn(i.locals, m[2]))) montages.push({ prefix: prefixe, var: m[2], line: ligneDe(m.index) });
  }

  // Routes d'API Next.js (app/pages), déduites du chemin du fichier
  const suivant = /(?:^|\/)(?:src\/)?app\/(.*?)\/?route\.(?:t|j)sx?$/.exec(cheminFichier) || /(?:^|\/)(?:src\/)?pages\/(api\/.*?)(?:\/index)?\.(?:t|j)sx?$/.exec(cheminFichier);
  if (suivant) {
    const p = '/' + suivant[1].split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@')).join('/');
    const methodes = tout(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g, code).map((m) => m[1]);
    for (const methode of methodes.length ? methodes : ['ANY']) routes.push({ method: methode, path: p, var: null, line: 1, framework: 'next' });
  }

  routes.push(...tableRoutesParCle(code, ligneDe));

  const declencheurs = /firebase-functions/.test(code) ? fonctionsFirebase(code, ligneDe, routes, montages) : [];

  // le préfixe d'un montage (y compris l'option `prefix: '/api'` de Fastify, souvent sur sa propre ligne) n'est pas un appel
  const ligneServeur = /\b\w+\.(use|route)\(\s*["'`]\/|\b(?:app|server|fastify|hono|routes?|router|[a-z]+Router)\.(?:get|post|put|patch|delete|all|options|head)\(\s*["'`]\/|\bprefix\s*:\s*["'`]\//;
  const { calls: appels, hosts: hotes } = extraireAppels(code, ligneDe, { skip: ligneServeur });
  const appelsVus = new Set(appels.map((c) => `${c.line}|${c.path}`));
  for (const c of appelsEnveloppes(code, ligneDe)) if (!appelsVus.has(`${c.line}|${c.path}`)) appels.push(c);
  const appelables = /\bhttpsCallable\b/.test(code) ? appelsAppelables(code, ligneDe) : { calls: [], wrappers: [] };
  appels.push(...appelables.calls);
  return { imports, symbols: symboles, routes, mounts: montages, calls: appels, hosts: hotes, ...(declencheurs.length ? { triggers: declencheurs } : {}), ...(appelables.wrappers.length ? { callableWrappers: appelables.wrappers } : {}) };
}

// ---------- Firebase Cloud Functions ----------

// `export const approveItem = onCall(…)`, `exports.sign = functions.region('eu').https.onRequest(…)`,
// `export const nightly = onSchedule('every day 03:00', …)` : le nom exporté, la chaîne qui précède le
// déclencheur (style v1 `functions.firestore.document('x')`), et le déclencheur lui-même
const FONCTION_FIREBASE = /(?:\bexport\s+(?:const|let|var)\s+|(?:^|[;\n])[ \t]*(?:const|let|var)\s+|\b(?:module\.)?exports\.)([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*((?:[A-Za-z_$][\w$]*(?:\([^()]*\))?\s*\.\s*)*)((?:on|before)[A-Z]\w*)\s*(?:<[^;]{0,300}?>)?\s*\(/g;
const PREMIERE_CHAINE = /["'`]([^"'`\n]{1,120})["'`]/;

/**
 * Les fonctions appelables (onCall) et onRequest deviennent des adresses du serveur nommées d'après leur export (CALL /approveItem,
 * ANY /signDocument) ; Firebase sert une appli Express passée à onRequest sous le nom de la fonction,
 * donc cela devient un montage. Tout autre déclencheur (planifications, Firestore, Storage, Pub/Sub, Auth) est une
 * tâche de fond, renvoyée pour le résumé de l'analyse.
 */
function fonctionsFirebase(code, ligneDe, routes, montages) {
  const declencheurs = [];
  for (const m of code.matchAll(FONCTION_FIREBASE)) {
    const [, nom, chaine, evenement] = m;
    const ligne = ligneDe(m.index + m[0].indexOf(nom));
    const argumentsAppel = code.slice(m.index + m[0].length, m.index + m[0].length + 300);
    if (evenement === 'onCall' || evenement === 'onCallGenkit' || evenement === 'onRequest') {
      routes.push({ method: evenement === 'onRequest' ? 'ANY' : 'CALL', path: '/' + nom, var: null, line: ligne, framework: 'firebase', handler: nom });
      const appli = evenement === 'onRequest' && /^\s*(?:\{[^{}]*\}\s*,\s*)?([A-Za-z_$][\w$]*)\s*\)/.exec(argumentsAppel)?.[1];
      if (appli) montages.push({ prefix: '/' + nom, var: appli, line: ligne });
      continue;
    }
    // les déclencheurs v1 nomment le fournisseur dans la chaîne (functions.pubsub.schedule(…).onRun) ; ceux de v2 portent son nom
    const fournisseur = /\b(pubsub|firestore|storage|auth|database|tasks|analytics|remoteConfig|testLab)\b/.exec(chaine)?.[1];
    if (chaine ? !fournisseur : !/^(onSchedule|onDocument|onObject|onMessagePublished|onValue|onTaskDispatched|onCustomEventPublished|on\w*Alert|onTestMatrix|onConfigUpdated|before[A-Z])/.test(evenement)) continue;
    // ce sur quoi il se déclenche : la dernière chaîne de la chaîne (après une éventuelle région), sinon le premier argument
    const quoi = [...chaine.matchAll(new RegExp(PREMIERE_CHAINE, 'g'))].pop()?.[1] || PREMIERE_CHAINE.exec(/^[^)]*/.exec(argumentsAppel)[0])?.[1] || null;
    declencheurs.push({ name: nom, on: fournisseur ? `${fournisseur}.${evenement}` : evenement, ...(quoi ? { what: quoi } : {}), line: ligne });
  }
  return declencheurs;
}

// httpsCallable(functions, 'approveItem'), httpsCallable<Req, Res>(getFunctions(app), 'x') et l'
// ancienne forme functions.httpsCallable('x') ; les arguments génériques peuvent couvrir plusieurs lignes
const APPELABLE = /\bhttpsCallable\s*(?:<[^;]{0,300}?>)?\s*\(\s*(?:[^,()'"`]*(?:\([^()]*\))?\s*,\s*)?(["'`])([\w-]+)\1/g;
const DEFINITIONS = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(([^)]*)\)\s*(?::\s*[^=]+?)?=>/g;
/** Le nom d'une fonction appelable sous forme de chemin : les fonctions groupées se déploient sous `groupe-nom`, donc 'items-approve' → /items/approve. */
const cheminAppelable = (nom) => '/' + nom.split('-').filter(Boolean).join('/');

/**
 * Appels aux fonctions Firebase appelables, par nom, plus les aides qui enveloppent httpsCallable
 * (`const call = (name, data) => httpsCallable(functions, name)(data)`) et leurs utilisations dans le même fichier.
 * Les noms des aides sont renvoyés aussi, pour que scan.mjs suive leurs utilisations dans les fichiers qui les importent.
 */
function appelsAppelables(code, ligneDe) {
  const appels = [...code.matchAll(APPELABLE)].map((m) => ({ path: cheminAppelable(m[2]), method: 'CALL', line: ligneDe(m.index) }));
  const enveloppes = [];
  for (const m of code.matchAll(DEFINITIONS)) {
    const nom = m[1] || m[3];
    const premierParam = /^[A-Za-z_$][\w$]*/.exec((m[2] ?? m[4]).trim())?.[0];
    if (!premierParam) continue;
    const corps = code.slice(m.index + m[0].length, m.index + m[0].length + 400);
    if (!new RegExp(`\\bhttpsCallable\\s*(?:<[^;]{0,300}?>)?\\s*\\(\\s*(?:[^,()'"\`]*(?:\\([^()]*\\))?\\s*,\\s*)?${premierParam}\\s*[,)]`).test(corps)) continue;
    enveloppes.push(nom);
    appels.push(...appelsVia(code, nom, ligneDe(m.index)));
  }
  return { calls: appels, wrappers: enveloppes };
}

/** Utilisations d'une aide d'appel : `callFunction('approveItem', data)` → CALL /approveItem. */
function appelsVia(code, nom, ligneASauter = 0) {
  const sortie = [];
  const regex = new RegExp(`(?<![\\w$.])${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:<[^;]{0,300}?>)?\\s*\\(\\s*(["'\`])([\\w-]+)\\1`, 'g');
  const ligneDe = indexLignes(code);
  for (const m of code.matchAll(regex)) {
    const ligne = ligneDe(m.index);
    if (ligne !== ligneASauter) sortie.push({ path: cheminAppelable(m[2]), method: 'CALL', line: ligne });
  }
  return sortie;
}
/** Pareil, dans un autre fichier qui importe l'aide (sous son nom local là-bas). */
export const appelsAppelablesVia = (source, nomLocal) => appelsVia(retirerCommentairesC(source), nomLocal);

/**
 * Appels passant par une aide définie dans le même fichier, qui ajoute un préfixe et appelle le serveur, par ex.
 *   const call = (path, method = 'GET') => apiClient.request(`/inventory${path}`, { method });
 *   definitions: () => call('/definitions'),
 * devient GET /inventory/definitions. Seules comptent les aides du même fichier dont le premier paramètre est
 * inséré dans une URL qu'un appel HTTP va chercher.
 */
function appelsEnveloppes(code, ligneDe) {
  const sortie = [];
  for (const m of code.matchAll(DEFINITIONS)) {
    const nom = m[1] || m[3];
    const parametres = (m[2] ?? m[4]).split(',').map((p) => p.trim()).filter(Boolean);
    const nomsParametres = parametres.map((p) => /^[A-Za-z_$][\w$]*/.exec(p)?.[0]);
    if (!nomsParametres[0] || /^(get|post|put|patch|delete|request|fetch)$/i.test(nom)) continue;
    const corpsBrut = code.slice(m.index + m[0].length, m.index + m[0].length + 700);
    const corps = aplatirGabarits(corpsBrut);
    if (!CONTEXTE_HTTP.test(corps)) continue;
    const gabarit = prefixeAvantParam(corpsBrut, nomsParametres[0]);
    if (gabarit == null) continue;
    const indiceMethode = nomsParametres.findIndex((p, i) => i > 0 && (/^method$/i.test(p) || new RegExp(`method\\s*:\\s*${p}\\b`).test(corps)));
    const methodeParDefaut = (indiceMethode > 0 && /=\s*["'`](\w+)["'`]/.exec(parametres[indiceMethode])?.[1]) || APPEL_METHODE.exec(corps)?.[1] || 'GET';
    const regexAppel = new RegExp(`\\b${nom}\\s*(?:<[^>]*>)?\\(\\s*([\"'\`])((?:\\\\.|(?!\\1)[^\\\\\\n])*)\\1([^\\n]*)`, 'g');
    const ligneDefinition = ligneDe(m.index);
    code.split('\n').forEach((brut, i) => {
      if (i + 1 === ligneDefinition) return; // la définition elle-même
      for (const c of aplatirGabarits(brut).matchAll(regexAppel)) {
        const n = normaliserLitteralAppel(gabarit + c[2]);
        if (!n?.path || n.host) continue;
        const verbe = indiceMethode > 0 ? /["'`](GET|POST|PUT|PATCH|DELETE)["'`]/i.exec(c[3])?.[1] : null;
        sortie.push({ path: n.path, method: (verbe || methodeParDefaut).toUpperCase(), line: i + 1 });
      }
    });
  }
  return sortie;
}
/** Le préfixe littéral juste avant ${param} dans le gabarit d'URL de l'aide (`${BASE}/prefix${path}` → "/prefix"), ou null. */
function prefixeAvantParam(corpsBrut, parametre) {
  const brut = new RegExp(`\`((?:\\$\\{[^}]*\\})*)([^\`$]*)\\$\\{\\s*${parametre}\\s*\\}`).exec(corpsBrut);
  return brut ? brut[2] : null;
}

// ---------- Python ----------

function extrairePy(source) {
  const code = retirerCommentairesDiese(source);
  const ligneDe = indexLignes(code);
  const imports = [];
  for (const m of tout(/^[ \t]*import[ \t]+([\w., \t]+)$/gm, code)) {
    for (const morceau of m[1].split(',')) {
      const [nomModule, pseudo] = morceau.trim().split(/\s+as\s+/);
      if (nomModule) imports.push({ spec: nomModule.trim(), names: [], alias: pseudo?.trim(), line: ligneDe(m.index) });
    }
  }
  for (const m of tout(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm, code)) {
    const noms = [];
    const pseudos = {};
    for (const morceau of m[2].replace(/[()\\]/g, ' ').split(',')) {
      const [origine, pseudo] = morceau.trim().split(/\s+as\s+/);
      if (origine && origine !== '*') { noms.push(origine.trim()); if (pseudo) pseudos[pseudo.trim()] = origine.trim(); }
    }
    imports.push({ spec: m[1], names: noms, aliases: pseudos, from: true, line: ligneDe(m.index) });
  }

  const symboles = [];
  for (const m of tout(/^(?:async[ \t]+)?def[ \t]+([A-Za-z]\w*)/gm, code)) symboles.push({ name: m[1], kind: 'function', line: ligneDe(m.index) });
  for (const m of tout(/^class[ \t]+([A-Za-z]\w*)/gm, code)) symboles.push({ name: m[1], kind: 'class', line: ligneDe(m.index) });
  symboles.sort((a, b) => a.line - b.line);

  const routes = [];
  const routeurs = {};
  for (const m of tout(/^[ \t]*([A-Za-z_]\w*)\s*=\s*(?:\w+\.)?(Blueprint|APIRouter|Router)\(([^)]*)\)/gm, code)) {
    routeurs[m[1]] = /(?:url_)?prefix\s*=\s*["']([^"']*)["']/.exec(m[3])?.[1] || '';
  }
  for (const m of tout(/^[ \t]*@([A-Za-z_]\w*)\.(route|get|post|put|patch|delete|api_route|websocket)\(\s*[rf]?["']([^"']*)["']([^\n]*)/gm, code)) {
    let methodes = [m[2].toUpperCase()];
    if (m[2] === 'route' || m[2] === 'api_route') {
      // les arguments du décorateur peuvent continuer sur plusieurs lignes, jusqu'au décorateur ou au def suivant
      const reste = code.slice(m.index + m[0].length - m[4].length, m.index + m[0].length + 400).split(/\n\s*(?:@|def |async def )/)[0];
      const methodesTrouvees = /methods\s*=\s*[\[(]([^\])]*)[\])]/.exec(reste);
      methodes = methodesTrouvees ? [...methodesTrouvees[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1].toUpperCase()) : ['GET'];
    }
    for (const methode of methodes) routes.push({ method: methode, path: m[3], var: m[1], line: ligneDe(m.index) });
  }
  routes.push(...tableRoutesParCle(code, ligneDe));
  // Django urls.py
  for (const m of tout(/\b(?:re_)?path\(\s*r?["']([^"']*)["']\s*,(?!\s*include\()/g, code)) routes.push({ method: 'ANY', path: '/' + m[1].replace(/^\^|\$$/g, ''), var: null, line: ligneDe(m.index), framework: 'django' });

  const montages = [];
  // path('api/orders/', include('orders.urls')) : les urls de ce module sont sous le préfixe, et ce fichier l'utilise
  for (const m of tout(/\b(?:re_)?path\(\s*r?["']([^"']*)["']\s*,\s*include\(\s*\(?\s*["']([\w.]+)["']/g, code)) {
    imports.push({ spec: m[2], names: [], line: ligneDe(m.index) });
    montages.push({ spec: m[2], prefix: m[1].replace(/^\^|\$$/g, ''), line: ligneDe(m.index) });
  }
  for (const m of tout(/\b(register_blueprint|include_router|mount)\(\s*([A-Za-z_][\w.]*)/g, code)) {
    // les arguments de l'appel, jusqu'à sa propre parenthèse fermante : dependencies=[Depends(x)] contient ses propres crochets
    let profondeur = 1, j = m.index + m[0].length;
    while (j < code.length && profondeur && j - m.index < 2000) { if (code[j] === '(') profondeur++; else if (code[j] === ')') profondeur--; j++; }
    const argumentsAppel = code.slice(m.index + m[0].length, j - 1);
    // Contrôles FastAPI appliqués à toutes les routes du routeur où il est inclus :
    // app.include_router(admin.router, dependencies=[Depends(require_admin)])
    const dependances = m[1] === 'include_router' ? /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(argumentsAppel)?.[1] : null;
    const intergiciels = dependances ? [...dependances.matchAll(/\b(?:Depends|Security)\(\s*([\w.]+)/g)].map((d) => d[1].split('.').pop()) : [];
    montages.push({ var: m[2], prefix: /(?:url_)?prefix\s*=\s*["']([^"']*)["']/.exec(argumentsAppel)?.[1] || '', line: ligneDe(m.index), ...(intergiciels.length ? { mw: intergiciels } : {}) });
  }

  const ligneRoute = /^\s*@\w+\.(route|get|post|put|patch|delete)\(/;
  const { calls: appels, hosts: hotes } = extraireAppels(code, ligneDe, { skip: ligneRoute });
  return { imports, symbols: symboles, routes, mounts: montages, calls: appels, hosts: hotes, routers: routeurs };
}

// ---------- Go ----------

function extraireGo(source) {
  const code = retirerCommentairesC(source);
  const ligneDe = indexLignes(code);
  const imports = [];
  for (const m of tout(/^import\s+(?:[\w.]+\s+)?"([^"]+)"/gm, code)) imports.push({ spec: m[1], names: [], line: ligneDe(m.index) });
  for (const bloc of tout(/^import\s*\(([\s\S]*?)\)/gm, code)) {
    for (const m of tout(/(?:[\w.]+\s+)?"([^"]+)"/g, bloc[1])) imports.push({ spec: m[1], names: [], line: ligneDe(bloc.index) });
  }
  const symboles = [];
  for (const m of tout(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm, code)) symboles.push({ name: m[1], kind: 'function', line: ligneDe(m.index) });
  for (const m of tout(/^type\s+([A-Z]\w*)\s+(struct|interface)?/gm, code)) symboles.push({ name: m[1], kind: m[2] || 'type', line: ligneDe(m.index) });
  const routes = [];
  for (const m of tout(/\.(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\(\s*"(\/[^"]*)"/g, code)) {
    const methode = /^handle/i.test(m[1]) ? 'ANY' : m[1].toUpperCase();
    const p = m[2].replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '');
    routes.push({ method: methode, path: p, var: null, line: ligneDe(m.index) });
  }
  const { calls: appels, hosts: hotes } = extraireAppels(code, ligneDe, { skip: /\.(HandleFunc|Handle|GET|POST)\(/ });
  return { imports, symbols: symboles, routes, mounts: [], calls: appels, hosts: hotes };
}

// ---------- Rust ----------

function extraireRust(source) {
  const code = retirerCommentairesC(source);
  const ligneDe = indexLignes(code);
  const imports = [];
  for (const m of tout(/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm, code)) imports.push({ spec: m[1], kind: 'mod', names: [], line: ligneDe(m.index) });
  for (const m of tout(/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?use\s+([\w:]+)/gm, code)) imports.push({ spec: m[1], kind: 'use', names: [], line: ligneDe(m.index) });
  const symboles = [];
  for (const m of tout(/^[ \t]*pub\s+(?:async\s+)?(fn|struct|enum|trait|type|const|static)\s+(\w+)/gm, code)) symboles.push({ name: m[2], kind: m[1] === 'fn' ? 'function' : m[1], line: ligneDe(m.index) });
  const routes = [];
  for (const m of tout(/#\[(get|post|put|patch|delete)\(\s*"([^"]+)"/g, code)) routes.push({ method: m[1].toUpperCase(), path: m[2], var: null, line: ligneDe(m.index) });
  for (const m of tout(/\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)/g, code)) routes.push({ method: m[2].toUpperCase(), path: m[1], var: null, line: ligneDe(m.index) });
  const { calls: appels, hosts: hotes } = extraireAppels(code, ligneDe);
  return { imports, symbols: symboles, routes, mounts: [], calls: appels, hosts: hotes };
}

// ---------- JVM ----------

function extraireJvm(source) {
  const code = retirerCommentairesC(source);
  const ligneDe = indexLignes(code);
  const paquet = /^\s*package\s+([\w.]+)/m.exec(code)?.[1] || null;
  const imports = tout(/^\s*import\s+(?:static\s+)?([\w.*]+)/gm, code).map((m) => ({ spec: m[1], names: [], line: ligneDe(m.index) }));
  const symboles = [];
  for (const m of tout(/^\s*(?:public\s+|internal\s+)?(?:abstract\s+|final\s+|data\s+|sealed\s+|open\s+)*(class|interface|enum|record|object)\s+(\w+)/gm, code)) symboles.push({ name: m[2], kind: m[1], line: ligneDe(m.index) });
  const routes = [];
  const prefixeClasse = /@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+)?class/.exec(code)?.[1] || '';
  for (const m of tout(/@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"/g, code)) {
    if (m[1] === 'Request' && m[2] === prefixeClasse) continue;
    routes.push({ method: m[1] === 'Request' ? 'ANY' : m[1].toUpperCase(), path: prefixeClasse + m[2], var: null, line: ligneDe(m.index) });
  }
  const { calls: appels, hosts: hotes } = extraireAppels(code, ligneDe, { skip: /@\w+Mapping/ });
  return { imports, symbols: symboles, routes, mounts: [], calls: appels, hosts: hotes, pkg: paquet };
}

// ---------- les petits ----------

function extraireSimple(source, langage) {
  const code = langage === 'ruby' ? retirerCommentairesDiese(source) : retirerCommentairesC(source);
  const ligneDe = indexLignes(code);
  const imports = [];
  if (langage === 'ruby') for (const m of tout(/\brequire_relative\s*\(?\s*["']([^"']+)["']/g, code)) imports.push({ spec: './' + m[1].replace(/^\.\//, ''), names: [], line: ligneDe(m.index) });
  if (langage === 'c' || langage === 'cpp' || langage === 'objc') for (const m of tout(/^\s*#\s*(?:include|import)\s+"([^"]+)"/gm, code)) imports.push({ spec: m[1], names: [], kind: 'include', line: ligneDe(m.index) });
  if (langage === 'php') for (const m of tout(/\b(?:require|include)(?:_once)?\s*\(?\s*(?:__DIR__\s*\.\s*)?["']([^"']+)["']/g, code)) imports.push({ spec: m[1].startsWith('/') ? '.' + m[1] : m[1], names: [], line: ligneDe(m.index) });
  if (langage === 'css') for (const m of tout(/@(?:import|use|forward)\s+(?:url\()?["']([^"']+)["']/g, code)) imports.push({ spec: m[1].startsWith('.') ? m[1] : './' + m[1], names: [], line: ligneDe(m.index) });
  const symboles = [];
  if (langage === 'ruby') for (const m of tout(/^\s*(class|module)\s+([A-Z][\w:]*)/gm, code)) symboles.push({ name: m[2], kind: m[1], line: ligneDe(m.index) });
  if (langage === 'csharp') for (const m of tout(/^\s*public\s+(?:static\s+|abstract\s+|sealed\s+|partial\s+)*(class|interface|enum|record|struct)\s+(\w+)/gm, code)) symboles.push({ name: m[2], kind: m[1], line: ligneDe(m.index) });
  const { calls: appels, hosts: hotes } = ['ruby', 'php', 'csharp', 'swift', 'dart', 'kotlin'].includes(langage) ? extraireAppels(code, ligneDe) : { calls: [], hosts: [] };
  return { imports, symbols: symboles, routes: [], mounts: [], calls: appels, hosts: hotes };
}

function extraireParLangage(source, langage, cheminFichier) {
  switch (langage) {
    case 'typescript': case 'javascript': case 'vue': case 'svelte': case 'astro': return extraireJs(source, cheminFichier);
    case 'python': return extrairePy(source);
    case 'go': return extraireGo(source);
    case 'rust': return extraireRust(source);
    case 'java': case 'kotlin': case 'scala': case 'groovy': return extraireJvm(source);
    default: return extraireSimple(source, langage);
  }
}

export function extraire(source, langage, cheminFichier) {
  const r = extraireParLangage(source, langage, cheminFichier);
  ajouterDocs(source, langage, r);
  return r;
}

// ---------- docs : en-têtes de fichier, docstrings, JSDoc, gestionnaires de routes ----------

const LANGAGES_DIESE = new Set(['python', 'ruby', 'shell', 'powershell', 'r', 'elixir', 'perl']);
const LICENCE = /copyright|license|spdx|eslint-disable|@ts-nocheck|prettier-ignore|^-\*-|coding[:=]|generated by|do not edit/i;

export function nettoyerDoc(texte) {
  if (!texte) return null;
  const lignes = texte.split('\n')
    .map((l) => l.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/\/?|#+|"""|''')\s?/, '').replace(/(\*\/|"""|''')\s*$/, '').trim())
    .filter((l) => l && !/^@\w+/.test(l) && !/^[-=*_]{3,}$/.test(l));
  // premier paragraphe seulement
  const paragraphe = [];
  for (const l of lignes) { if (!l && paragraphe.length) break; paragraphe.push(l); }
  let s = paragraphe.join(' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 8 || LICENCE.test(s)) return null;
  const phrase = /^(.{20,220}?[.!?])(\s|$)/.exec(s);
  s = phrase ? phrase[1] : s.length > 220 ? s.slice(0, 217).replace(/\s+\S*$/, '') + '…' : s;
  return s;
}

function docPyApres(lignes, indice) {
  // indice : ligne (à partir de 0) du def/class (ou -1 pour le module). On cherche la fin de la signature, puis un littéral chaîne.
  let i = indice;
  if (indice >= 0) {
    while (i < lignes.length && i < indice + 20 && !/:\s*(#.*)?$/.test(lignes[i])) i++;
    i++;
  } else i = 0;
  while (i < lignes.length && (!lignes[i].trim() || (indice < 0 && /^\s*(#|from __future__)/.test(lignes[i])))) i++;
  const premiere = lignes[i];
  if (!premiere) return null;
  const m = /^\s*[rRbBuUfF]?("""|''')(.*)$/.exec(premiere);
  if (!m) return indice < 0 ? enteteDiese(lignes) : null;
  const guillemet = m[1];
  if (m[2].includes(guillemet)) return nettoyerDoc(m[2].slice(0, m[2].indexOf(guillemet)));
  const tampon = [m[2]];
  for (let j = i + 1; j < lignes.length && j < i + 40; j++) {
    const k = lignes[j].indexOf(guillemet);
    if (k >= 0) { tampon.push(lignes[j].slice(0, k)); break; }
    tampon.push(lignes[j]);
  }
  return nettoyerDoc(tampon.join('\n'));
}

function enteteDiese(lignes) {
  const tampon = [];
  for (const l of lignes) {
    if (/^#!/.test(l)) continue;
    if (/^\s*#/.test(l)) { tampon.push(l); continue; }
    if (!l.trim() && !tampon.length) continue;
    break;
  }
  return nettoyerDoc(tampon.join('\n'));
}

function commentaireAvant(lignes, indice) {
  // indice : ligne (à partir de 0) de la déclaration. On saute les décorateurs/annotations, puis on lit un bloc /** */ ou une suite de //.
  let i = indice - 1;
  while (i >= 0 && /^\s*@/.test(lignes[i])) i--;
  if (i < 0) return null;
  if (/\*\/\s*$/.test(lignes[i])) {
    const fin = i;
    while (i >= 0 && !/\/\*/.test(lignes[i])) i--;
    return i >= 0 ? nettoyerDoc(lignes.slice(i, fin + 1).join('\n')) : null;
  }
  const tampon = [];
  while (i >= 0 && /^\s*(\/\/|#(?!!))/.test(lignes[i])) tampon.unshift(lignes[i--]);
  return tampon.length ? nettoyerDoc(tampon.join('\n')) : null;
}

function commentaireEntete(lignes) {
  let i = 0;
  while (i < lignes.length && (!lignes[i].trim() || /^\s*['"]use (client|server|strict)['"];?\s*$/.test(lignes[i]) || /^#!/.test(lignes[i]))) i++;
  const l = lignes[i] || '';
  if (/^\s*\/\*/.test(l)) {
    const debut = i;
    while (i < lignes.length && !/\*\//.test(lignes[i])) i++;
    return nettoyerDoc(lignes.slice(debut, i + 1).join('\n'));
  }
  const tampon = [];
  while (i < lignes.length && /^\s*\/\//.test(lignes[i])) tampon.push(lignes[i++]);
  return nettoyerDoc(tampon.join('\n'));
}

function ajouterDocs(source, langage, r) {
  const lignes = source.split('\n');
  r.doc = langage === 'python' ? docPyApres(lignes, -1) : LANGAGES_DIESE.has(langage) ? enteteDiese(lignes) : commentaireEntete(lignes);
  for (const s of r.symbols || []) {
    const d = langage === 'python' ? docPyApres(lignes, s.line - 1) : commentaireAvant(lignes, s.line - 1);
    if (d) s.doc = d;
  }
  // Le gestionnaire d'une route est la première déclaration qui la suit (frameworks à décorateurs).
  // (l'export d'une fonction Firebase n'est pas le gestionnaire des routes Express au-dessus)
  const nomsFirebase = new Set((r.routes || []).filter((rt) => rt.framework === 'firebase').map((rt) => rt.handler));
  const symbolesTries = (r.symbols || []).filter((s) => !nomsFirebase.has(s.name)).sort((a, b) => a.line - b.line);
  for (const rt of r.routes || []) {
    if (rt.framework === 'next') { rt.handler = rt.method; continue; }
    if (rt.framework === 'table') { const d = r.symbols?.find((s) => s.name === rt.handler)?.doc; if (d) rt.doc = d; continue; }
    if (rt.framework === 'firebase') { const d = r.symbols.find((s) => s.name === rt.handler)?.doc || commentaireAvant(lignes, rt.line - 1); if (d) rt.doc = d; continue; }
    const h = symbolesTries.find((s) => s.line >= rt.line && s.line - rt.line <= 12);
    if (h) { rt.handler = h.name; if (h.doc) rt.doc = h.doc; }
    else if (langage === 'python') {
      const m = lignes.slice(rt.line, rt.line + 12).findIndex((l) => /^\s*(async\s+)?def\s+\w+/.test(l));
      if (m >= 0) {
        rt.handler = /def\s+(\w+)/.exec(lignes[rt.line + m])[1];
        const d = docPyApres(lignes, rt.line + m);
        if (d) rt.doc = d;
      }
    }
  }
}
