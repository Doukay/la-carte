// Transforme les routes définies fichier par fichier + les montages en chemins complets, puis y rattache les appels HTTP trouvés dans le code.
// C'est ce qui relie un dépôt de front à un dépôt de back quand aucun import ne les relie.

export const segmentsRoute = (p) => p.split('/').filter(Boolean).map((s) =>
  /^(<[^>]*>|\{[^}]*\}|:\w+|\[\.{0,3}[^\]]*\]|\*{1,2}|\$\{[^}]*\})$/.test(s) || /\$\{|\{[^}]*\}/.test(s) ? '*' : s);

const FICHIER_TEST = /(^|\/)(tests?|__tests__|spec|specs|e2e|fixtures?)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$|(^|\/)conftest\.py$/;

const joindreChemin =(...morceaux) => '/' + morceaux.map((p) => (p || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

/**
 * @param fichiers   fichiers analysés : { path, lang, routes, mounts, routers, imports:[{names, aliases, alias, files[]}] }
 * @returns routes   [{ file, method, path, line }]
 */
/** Le fichier (et la variable de routeur, '*' = tous) visé par une instruction de montage. */
function cibleMontage(f, montage) {
  const imports = (f.imports || []).filter((i) => i.files?.length);
  if (montage.spec) { const importe = imports.find((i) => i.spec === montage.spec); return importe ? { file: importe.files[0], v: '*' } : null; }
  const [tete, attribut] = montage.var.split('.');
  if (f.lang !== 'python') {
    // JS : on associe le nom monté au nom local d'un import ou d'un require (tous les routeurs peuvent s'appeler `router`)
    const importe = imports.find((i) => i.locals && Object.hasOwn(i.locals, tete));
    return { file: importe ? importe.files[0] : f.path, v: '*' };
  }
  // D'abord l'import qui donne son nom au routeur monté dans ce fichier : `from app.routes import campaigns as
  // campaign_routes` donne le nom campaign_routes (pas campaigns), et l'emporte sur `from app.platform import pricing`
  // dont le module se termine seulement par le nom d'un routeur (platform).
  const lie = imports.find((importe) => importe.from
    ? Object.hasOwn(importe.aliases || {}, tete) || (importe.names?.includes(tete) && !Object.values(importe.aliases || {}).includes(tete))
    : (importe.alias || importe.spec?.split('.')[0]) === tete);
  if (lie && (attribut || lie.from)) {
    const origine = lie.aliases?.[tete] || tete;
    const fichier = (lie.from && lie.files.length > 1 && lie.files[lie.names.indexOf(origine)]) || lie.files[0];
    return { file: fichier, v: attribut || origine };
  }
  for (const importe of imports) {
    if (attribut && (importe.alias === tete || importe.spec?.split('.').pop() === tete || importe.names?.includes(tete))) {
      return { file: importe.files[importe.names?.indexOf(tete) ?? 0] || importe.files[0], v: attribut };
    }
    if (!attribut) {
      const origine = importe.aliases?.[tete] || tete;
      if (importe.names?.includes(origine)) return { file: importe.files.length === 1 ? importe.files[0] : importe.files[importe.names.indexOf(origine)] || importe.files[0], v: origine };
    }
  }
  return { file: f.path, v: tete }; // défini dans le même fichier
}

export function resoudreRoutes(fichiers) {
  // montagesVers[fichier] = [{ from, v, prefix }]   (v === '*' vaut pour toutes les routes du fichier)
  const montagesVers = new Map();
  for (const f of fichiers) for (const montage of FICHIER_TEST.test(f.path) ? [] : f.mounts || []) {
    const t = cibleMontage(f, montage);
    if (!t) continue;
    if (!montagesVers.has(t.file)) montagesVers.set(t.file, []);
    montagesVers.get(t.file).push({ from: f.path, v: t.v, prefix: montage.prefix, mw: montage.mw || [] });
  }
  // Tous les préfixes sous lesquels vivent les routes d'un fichier, en composant les montages imbriqués (un routeur monté dans un routeur
  // lui-même monté), par ex. app.use('/api', api) + api.use('/users', users) → /api/users.
  const prefixesExterieurs = (fichier, v, vus = new Set()) => {
    const montages = (montagesVers.get(fichier) || []).filter((m) => v == null || m.v === '*' || m.v === v);
    if (!montages.length || vus.has(fichier)) return [''];
    const suivant = new Set(vus).add(fichier);
    const sortie = [];
    for (const m of montages) for (const p of m.from === fichier ? [''] : prefixesExterieurs(m.from, null, suivant)) sortie.push(joindreChemin(p, m.prefix));
    return [...new Set(sortie)];
  };

  // Intergiciels (middleware) appliqués là où les routeurs d'un fichier sont montés, jusqu'en haut : app.use('/admin', requireStaff, admin)
  // puis admin.use('/orders', orders) met requireStaff devant chaque route de orders.
  const intergicielsMontage = (fichier, v, vus = new Set()) => {
    const montages = (montagesVers.get(fichier) || []).filter((m) => v == null || m.v === '*' || m.v === v);
    if (!montages.length || vus.has(fichier)) return [];
    const suivant = new Set(vus).add(fichier);
    // une route n'est protégée que par son montage le moins protégé
    const chacun = montages.map((m) => [...m.mw, ...(m.from === fichier ? [] : intergicielsMontage(m.from, null, suivant))]);
    return chacun.reduce((a, b) => a.filter((x) => b.includes(x)));
  };

  // Firebase déploie une fonction sous le nom que le fichier d'entrée des fonctions lui donne en l'exportant, donc
  // `export { approveItem as approve } from './items'` la renomme : `${file}|approveItem` -> ['approve']
  const exporteSous = new Map();
  for (const f of fichiers) for (const importe of f.imports || []) {
    if (!importe.exported || !importe.files?.length) continue;
    for (const [nomExporte, origine] of Object.entries(importe.exported)) {
      if (nomExporte === origine) continue;
      const k = `${importe.files[0]}|${origine}`;
      exporteSous.set(k, [...(exporteSous.get(k) || []), nomExporte]);
    }
  }

  // onRequest(app) sert une appli Express sous le nom de la fonction ; ce sont ses propres routes qui sont les adresses du serveur
  const parChemin = new Map(fichiers.map((f) => [f.path, f]));
  const enveloppeApp = (fichier, prefixe) => [...montagesVers].some(([vers, montages]) => montages.some((m) => m.from === fichier && m.prefix === prefixe) && parChemin.get(vers)?.routes?.some((r) => r.framework !== 'firebase'));

  const routes = [];
  for (const f of fichiers) {
    // Les fichiers de test définissent des applis jetables et des faux serveurs ; leurs routes ne font pas partie du système.
    if (!f.routes?.length || FICHIER_TEST.test(f.path)) continue;
    for (const r of f.routes) {
      if (r.framework === 'firebase') {
        if (r.method === 'ANY' && enveloppeApp(f.path, r.path)) continue;
        // servie sous son propre nom, quel que soit le préfixe sous lequel les routeurs du fichier sont montés
        for (const nom of exporteSous.get(`${f.path}|${r.handler}`) || [r.handler]) routes.push({ file: f.path, method: r.method, path: '/' + nom, line: r.line, handler: nom, framework: 'firebase', ...(r.doc ? { doc: r.doc } : {}) });
        continue;
      }
      const prefixeDefini = (r.var && f.routers?.[r.var]) || '';
      const intergiciels = intergicielsMontage(f.path, r.var);
      for (const prefixeMontage of prefixesExterieurs(f.path, r.var)) routes.push({ file: f.path, method: r.method, path: joindreChemin(prefixeMontage, prefixeDefini, r.path), line: r.line, ...(r.handler ? { handler: r.handler } : {}), ...(r.doc ? { doc: r.doc } : {}), ...(intergiciels.length ? { mountMw: intergiciels } : {}) });
    }
  }
  return dedupliquer(routes, (r) => `${r.file}|${r.method}|${r.path}`);
}

function dedupliquer(liste, cle) {
  const vus = new Set();
  return liste.filter((x) => { const k = cle(x); if (vus.has(k)) return false; vus.add(k); return true; });
}

/** Note à quel point le chemin d'un appel correspond au chemin d'une route ; null quand ils ne peuvent pas correspondre. */
export const noterAppel = (c, r) => noter(c, r);
function noter(c, r) {
  const n = Math.min(c.length, r.length);
  if (n === 0) return null;
  let litteral = 0, jokers = 0, souple = 0;
  for (let i = 1; i <= n; i++) {
    const a = c[c.length - i], b = r[r.length - i];
    if (a === b && a !== '*') litteral++;
    else if (b === '*') jokers++;           // paramètre de route : correspond à tout
    else if (a === '*') souple++;          // partie variable de l'appel face à un segment fixe de la route : possible, moins probable
    else return null;
  }
  jokers += souple;
  const surplus = Math.max(c.length, r.length) - n;
  if (litteral === 0) return null;
  // indice mince (un seul segment identique sous un préfixe inconnu) : gardé seulement si le préfixe correspond à
  // ce que cet appelant utilise d'habitude, voir associerAppels
  const faible = (litteral === 1 && jokers === 0 && surplus > 2) || (litteral === 1 && jokers > 0 && surplus > 0);
  // la partie de la route que l'appel n'écrit pas, en général l'adresse de base du client ("api/store")
  const prefixe = r.length > c.length ? r.slice(0, r.length - n).join('/') : '';
  return { s: litteral * 3 + jokers - souple * 0.8 - surplus * 0.5 + (surplus === 0 ? 1 : 0) - (faible ? 100 : 0), literal: litteral, prefix: prefixe, weak: faible };
}

/**
 * Rattache les appels trouvés dans le code aux routes résolues.
 * Les égalités se départagent par le préfixe de base appris pour l'appelant : si les appels sans ambiguïté d'un client tombent tous
 * sous /api/store, son `/orders` ambigu veut dire /api/store/orders, pas /api/admin/orders.
 * @returns [{ from, to, method, path, call, line }]
 */
export function associerAppels(fichiers, routes) {
  const routesSegmentees = routes.map((r) => ({ ...r, segs: segmentsRoute(r.path) }));
  const enAttente = [];
  const appris = new Map(); // fichier ou dossier appelant -> Map(préfixe -> nombre)
  const apprendre = (cle, prefixe) => { if (!appris.has(cle)) appris.set(cle, new Map()); const m = appris.get(cle); m.set(prefixe, (m.get(prefixe) || 0) + 1); };
  for (const f of fichiers) {
    for (const appel of f.calls || []) {
      const segmentsAppel = segmentsRoute(appel.path);
      let meilleur = -Infinity, candidats = [];
      for (const r of routesSegmentees) {
        if (r.file === f.path) continue;
        // une fonction Firebase appelable (CALL) ne s'atteint que par httpsCallable, et ne mène qu'à des fonctions appelables
        if ((appel.method === 'CALL') !== (r.method === 'CALL')) continue;
        if (appel.method && r.method !== 'ANY' && r.method !== appel.method) continue;
        const evaluation = noter(segmentsAppel, r.segs);
        if (!evaluation) continue;
        if (evaluation.s > meilleur) { meilleur = evaluation.s; candidats = [{ r, ...evaluation }]; } else if (evaluation.s === meilleur) candidats.push({ r, ...evaluation });
      }
      if (!candidats.length) continue;
      enAttente.push({ f, call: appel, hits: candidats });
      if (!candidats[0].weak && new Set(candidats.map((h) => h.r.file)).size === 1) { apprendre(f.path, candidats[0].prefix); apprendre(dossierDe(f.path), candidats[0].prefix); }
    }
  }
  const premier = (cle) => { const m = appris.get(cle); return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null; };
  const sortie = [];
  for (const { f, call: appel, hits: candidats } of enAttente) {
    let gardes = candidats;
    const prefere = premier(f.path) ?? premier(dossierDe(f.path));
    // les correspondances faibles demandent l'historique de l'appelant lui-même, pas celui d'un voisin
    if (candidats[0].weak) { const propre = premier(f.path); gardes = propre == null ? [] : candidats.filter((h) => h.prefix === propre); if (!gardes.length) continue; }
    // aucune méthode visible à l'endroit de l'appel : fetch utilise GET par défaut
    if (!appel.method && gardes.some((h) => h.r.method === 'GET') && new Set(gardes.map((h) => h.r.method)).size > 1) gardes = gardes.filter((h) => h.r.method === 'GET' || h.r.method === 'ANY');
    if (new Set(gardes.map((h) => h.r.file)).size > 1) {
      const restreints = prefere == null ? [] : gardes.filter((h) => h.prefix === prefere);
      if (restreints.length) gardes = restreints;
    }
    if (new Set(gardes.map((h) => h.r.file)).size > 3) continue;
    for (const { r } of gardes) sortie.push({ from: f.path, to: r.file, method: r.method, path: r.path, call: appel.path, line: appel.line, routeLine: r.line });
  }
  return dedupliquer(sortie, (e) => `${e.from}|${e.to}|${e.method}|${e.path}`);
}
const dossierDe = (p) => p.split('/').slice(0, -1).join('/');
