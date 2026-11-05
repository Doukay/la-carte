// Plans : une carte (la-carte) d’un système pas encore construit, prévue à partir d’un cahier des charges (PRD) ou d’une description.
//
// planVersAnalyse(plan, root) — transforme la-carte/plan.json (les fichiers, adresses du serveur et appels prévus,
//                          écrits par l’agent) en la même forme de analyse.json que analyser.mjs écrit pour du vrai code, de sorte que
//                          construire.mjs et le visualiseur marchent sans changement. Renvoie { scan, errors, warnings }.
// construireSantePlan(ctx) — appelée par construire.mjs à la place de construireSante pour un plan : une revue du plan
//                          (qui peut appeler chaque adresse du serveur, bouts qui ne mènent nulle part, questions ouvertes)
//                          sous la même forme { summary, problemes }, pour que le panneau Santé l’affiche.

import path from 'node:path';
import { classer, versPosix } from './commun.mjs';
import { associerAppels } from './routes.mjs';

// qui peut utiliser une adresse du serveur. "team" désigne les personnes qui font tourner le service (ses propres pages d’administration), pas les utilisateurs de l’app.
export const ACCES = ['public', 'signed-in', 'team', 'webhook', 'internal'];
const METHODES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'CALL', 'ANY'];
const ECRITURE = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'CALL']);
const estTexte = (v) => typeof v === 'string' && v.trim().length > 0;
const listeTextes = (v) => (Array.isArray(v) ? v.filter(estTexte) : []);
const cleRoute = (m, p) => `${m} ${p}`;

/** "POST /api/orders" -> { method, path }, ou null. */
export function lireAppel(s) {
  const m = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/.exec(String(s || ''));
  return m && METHODES.includes(m[1].toUpperCase()) ? { method: m[1].toUpperCase(), path: m[2] } : null;
}

export function planVersAnalyse(plan, racine) {
  const erreurs = [], avertissements = [];
  const erreur = (m) => erreurs.push(m), avertir = (m) => avertissements.push(m);
  if (!plan || typeof plan !== 'object') return { scan: null, errors: ['plan.json doit être un objet'], warnings: avertissements };
  const fichiers = Array.isArray(plan.files) ? plan.files : [];
  const adresses = Array.isArray(plan.endpoints) ? plan.endpoints : [];
  if (!fichiers.length) erreur('files doit être une liste non vide des fichiers que le système aurait');

  const parChemin = new Map();
  fichiers.forEach((f, i) => {
    const endroit = `files[${i}]${f?.path ? ` ("${f.path}")` : ''}`;
    if (!estTexte(f?.path)) return erreur(`${endroit}.path est obligatoire`);
    const p = versPosix(f.path.trim()).replace(/^\.\//, '');
    if (p.startsWith('/') || p.includes('..')) return erreur(`${endroit}.path doit être relatif au dossier du projet`);
    if (parChemin.has(p)) return erreur(`${endroit}.path est en double avec un fichier précédent`);
    if (!estTexte(f.description)) avertir(`${endroit} n’a pas de description`);
    parChemin.set(p, f);
  });
  const connus = [...parChemin.keys()];
  const proche = (p) => { const base = p.split('/').pop(); const trouve = connus.find((k) => k.split('/').pop() === base); return trouve ? ` (tu voulais dire « ${trouve} » ?)` : ''; };

  // adresses du serveur, classées par "METHODE /chemin"
  const routes = [], acces = {}, vus = new Set();
  adresses.forEach((e, i) => {
    const endroit = `endpoints[${i}]${e?.method && e?.path ? ` ("${e.method} ${e.path}")` : ''}`;
    const methode = String(e?.method || '').toUpperCase();
    if (!METHODES.includes(methode)) return erreur(`${endroit}.method doit être l’une de : ${METHODES.join(', ')}`);
    if (!estTexte(e.path) || !e.path.startsWith('/')) return erreur(`${endroit}.path doit commencer par "/"`);
    if (!estTexte(e.file)) return erreur(`${endroit}.file est obligatoire : le fichier prévu qui s’en occupe`);
    const fichier = versPosix(e.file.trim()).replace(/^\.\//, '');
    if (!parChemin.has(fichier)) return erreur(`${endroit}.file "${fichier}" n’est pas un des fichiers prévus${proche(fichier)}`);
    const cle = cleRoute(methode, e.path);
    if (vus.has(cle)) return erreur(`${endroit} répète une adresse du serveur précédente`);
    vus.add(cle);
    if (e.access !== undefined && !ACCES.includes(e.access)) erreur(`${endroit}.access "${e.access}" doit être l’une de : ${ACCES.join(', ')}${e.access === 'staff' ? ' ("team" désigne ta propre équipe ; pour une partie des utilisateurs de l’app, utilise "signed-in" avec "who")' : ''}`);
    if (e.who !== undefined && !estTexte(e.who)) erreur(`${endroit}.who doit être quelques mots, par exemple "les responsables de ce site"`);
    if (e.publicBecause !== undefined && !estTexte(e.publicBecause)) erreur(`${endroit}.publicBecause doit dire pourquoi elle est ouverte à tout le monde`);
    if (ACCES.includes(e.access)) acces[cle] = e.access;
    routes.push({ file: fichier, method: methode, path: e.path, line: 0, ...(ACCES.includes(e.access) ? { access: e.access } : {}), ...(estTexte(e.who) ? { who: e.who.trim() } : {}), ...(estTexte(e.publicBecause) ? { publicBecause: e.publicBecause.trim() } : {}), ...(estTexte(e.name) ? { name: e.name.trim() } : {}), ...(estTexte(e.description) ? { desc: e.description.trim() } : {}) });
  });
  const clesRoutes = new Set(routes.map((r) => cleRoute(r.method, r.path)));

  // imports, appels et liens vers les services extérieurs et les stockages de données
  const liensFichiers = [], liensNoeuds = [], fichiersAppelants = [];
  for (const [p, f] of parChemin) {
    for (const u of listeTextes(f.uses)) {
      const vers = versPosix(u.trim()).replace(/^\.\//, '');
      if (!parChemin.has(vers)) { erreur(`files "${p}".uses "${u}" n’est pas un des fichiers prévus${proche(vers)}`); continue; }
      if (vers !== p) liensFichiers.push({ from: p, to: vers });
    }
    const appels = [];
    for (const c of listeTextes(f.calls)) {
      const appelLu = lireAppel(c);
      if (!appelLu) { erreur(`files "${p}".calls "${c}" doit ressembler à "POST /api/orders"`); continue; }
      if (!clesRoutes.has(cleRoute(appelLu.method, appelLu.path))) avertir(`files "${p}".calls "${c}" ne correspond à aucune adresse du serveur prévue`);
      appels.push({ path: appelLu.path, method: appelLu.method, line: 0 });
    }
    if (appels.length) fichiersAppelants.push({ path: p, calls: appels });
    for (const s of listeTextes(f.services)) liensNoeuds.push({ from: p, to: s.trim(), kind: 'http' });
    for (const d of listeTextes(f.data)) liensNoeuds.push({ from: p, to: d.trim(), kind: 'data' });
  }
  // un appel n’atteint que l’adresse du serveur prévue exacte (méthode et chemin), jamais une adresse presque identique
  const http = associerAppels(fichiersAppelants, routes).filter((h) => clesRoutes.has(cleRoute(h.method, h.path)) && h.call === h.path);

  const questions = [];
  (Array.isArray(plan.questions) ? plan.questions : []).forEach((q, i) => {
    const texte = estTexte(q) ? q : q?.question;
    if (!estTexte(texte)) return erreur(`questions[${i}] doit contenir une question`);
    questions.push({ question: texte.trim(), about: listeTextes(q?.about) });
  });

  const scan = {
    version: 1,
    ebauche: {
      source: estTexte(plan.source) ? plan.source.trim() : '',
      stack: listeTextes(plan.stack),
      assumptions: listeTextes(plan.assumptions),
      questions,
      access: acces,
    },
    generatedAt: new Date().toISOString(),
    root: versPosix(racine),
    rootName: path.basename(racine),
    repos: [],
    files: [...parChemin].map(([p, f]) => {
      const c = classer(p, 0);
      return {
        path: p, repo: null, category: 'code', lang: c.lang || path.posix.extname(p).slice(1) || null, loc: 0, bytes: 0,
        ...(estTexte(f.name) ? { name: f.name.trim() } : {}),
        ...(estTexte(f.description) ? { desc: f.description.trim() } : {}),
        ...(estTexte(f.screen) && f.screen.startsWith('/') ? { ecrans: [{ fw: 'plan', url: f.screen.trim() }] } : {}),
      };
    }),
    edges: liensFichiers,
    externals: [],
    extEdges: [],
    routes,
    http,
    hosts: [],
    nodeLinks: liensNoeuds,
  };
  return { scan, errors: erreurs, warnings: avertissements };
}

/** La revue du plan affichée dans le panneau Santé pour un plan. */
export function construireSantePlan({ graph: graphe, scan }) {
  const ebauche = scan.ebauche || {};
  const problemes = [];
  const routes = graphe.routes || [];
  const idRouteDe = new Map(routes.map((r, i) => [cleRoute(r.m, r.p), 'r:' + i]));
  const idsFichiers = new Set(graphe.files.map((f) => 'f:' + f.p));
  const idsNoeuds = new Set(graphe.nodes.map((n) => 'n:' + n.id));
  const refDe = (s) => {
    if (!estTexte(s)) return null;
    const t = s.trim();
    if (idsNoeuds.has('n:' + t)) return 'n:' + t;
    if (idsFichiers.has('f:' + t)) return 'f:' + t;
    const appelLu = lireAppel(t);
    return appelLu ? idRouteDe.get(cleRoute(appelLu.method, appelLu.path)) || null : null;
  };
  const ligne = (r) => `- ${r.m} ${r.p} (${r.f})${r.name ? ` — ${r.name}` : ''}`;
  const reconstruire = 'Ensuite reconstruis le plan : lance plan.mjs puis construire.mjs, du skill La carte, comme l’indiquent ses consignes. Réponds-moi en français, en me tutoyant, en langage simple.';
  // chaque problème porte aussi `change` : une demande pour le régler depuis la carte (le mode Modifier de la bulle de questions), que la personne termine ou modifie
  const listerNoms = (xs, max = 6) => { const l = xs.slice(0, max).concat(xs.length > max ? [`${xs.length - max} autres`] : []); return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l.at(-1)}`; };
  const texteAdresse = (r) => `${r.m} ${r.p}`;

  // ---------- qui peut appeler chaque adresse du serveur ----------
  const accesDe = (r) => ebauche.access?.[cleRoute(r.m, r.p)];
  // ouverte exprès, avec une raison (publicBecause), compte comme relue
  const ecrituresOuvertes = routes.map((r, i) => ({ r, i })).filter(({ r }) => accesDe(r) === 'public' && ECRITURE.has(r.m) && !r.publicBecause);
  if (ecrituresOuvertes.length) problemes.push({
    id: 'plan-open-writes', kind: 'unprotected-endpoint', severity: 'medium',
    change: `Passe en revue qui peut utiliser ${listerNoms(ecrituresOuvertes.map(({ r }) => texteAdresse(r)))} : n’importe qui peut actuellement modifier des données par ce biais. `,
    title: ecrituresOuvertes.length === 1 ? 'N’importe qui pourrait modifier des données par une adresse du serveur prévue' : `N’importe qui pourrait modifier des données par ${ecrituresOuvertes.length} adresses du serveur prévues`,
    detail: `Avec le plan, n’importe qui peut créer, modifier ou supprimer des données par ${ecrituresOuvertes.length === 1 ? 'cette adresse du serveur' : 'ces adresses du serveur'}, sans se connecter. C’est normal pour une inscription ou une commande en invité, mais mieux vaut y regarder à deux fois avant de construire : ${ecrituresOuvertes.length === 1 ? 'c’est le point le plus facile' : 'ce sont les points les plus faciles'} à détourner pour un inconnu.`,
    items: ecrituresOuvertes.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(ecrituresOuvertes.slice(0, 24).map(({ i }) => ['r:' + i, 'Prévue ouverte à tout le monde, et elle modifie des données'])),
    locations: [],
    fix: [`Revue du plan de la-carte/plan.json : ces adresses du serveur prévues modifient des données et sont marquées "access": "public" :`, ...ecrituresOuvertes.map(({ r }) => ligne(r)), ``, `Pour chacune, dis-moi en mots simples si un inconnu doit vraiment pouvoir l’utiliser. Quand ce n’est pas le cas, passe son accès à "signed-in" (avec "who" si seuls certains utilisateurs y ont droit) dans plan.json. Quand elle doit rester publique (connexion, inscription, commande en invité), renseigne "publicBecause" avec la raison, y compris ce qui limite les abus (limitation du nombre d’essais, CAPTCHA, confirmation par e-mail). Demande-moi si tu hésites.`, reconstruire].join('\n'),
  });
  const inconnus = routes.map((r, i) => ({ r, i })).filter(({ r }) => !accesDe(r));
  if (inconnus.length) problemes.push({
    id: 'plan-no-access', kind: 'unprotected-endpoint', severity: 'medium',
    change: `Décide qui peut utiliser ${listerNoms(inconnus.map(({ r }) => texteAdresse(r)))}, d’après le cahier des charges (PRD). `,
    title: inconnus.length === 1 ? 'Le plan ne dit pas qui peut utiliser une adresse du serveur' : `Le plan ne dit pas qui peut utiliser ${inconnus.length} adresses du serveur`,
    detail: `Décider dès maintenant qui peut utiliser chaque partie du système (tout le monde, les clients connectés, seulement les responsables, ta propre équipe, un autre service) est bien plus simple que d’ajouter des contrôles de connexion une fois le système construit.`,
    items: inconnus.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(inconnus.slice(0, 24).map(({ i }) => ['r:' + i, 'Qui peut l’utiliser n’est pas décidé'])),
    locations: [],
    fix: [`Revue du plan de la-carte/plan.json : ces adresses du serveur prévues n’ont pas de "access" défini :`, ...inconnus.map(({ r }) => ligne(r)), ``, `Pour chacune, choisis qui peut l’utiliser : "public" (tout le monde), "signed-in" (avec "who" quand seuls certains utilisateurs y ont droit, par exemple "les responsables de ce site"), "team" (seulement les personnes qui font tourner le service), "webhook" (le service d’une autre entreprise, qui doit prouver que c’est bien lui) ou "internal" (seulement nos propres services). Appuie-toi sur le PRD ; demande-moi quand le PRD ne le dit pas.`, reconstruire].join('\n'),
  });

  // ---------- questions ouvertes du PRD ----------
  ebauche.questions?.forEach((q, k) => {
    const elements = [...new Set(q.about.map(refDe).filter(Boolean))];
    problemes.push({
      id: 'plan-question:' + k, kind: 'question', severity: 'medium',
      change: `Question ouverte : « ${q.question} » Ma réponse : `,
      title: q.question,
      detail: 'Le PRD ne répond pas à cette question, et la réponse change ce qui sera construit. Tranche avant de construire les parties concernées.',
      items: elements, notes: Object.fromEntries(elements.map((id) => [id, 'Dépend d’une question ouverte'])),
      locations: [],
      fix: [`Question ouverte dans le plan (la-carte/plan.json) : ${q.question}`, ``, `Explique-moi les options en mots simples, avec ce que chacune changerait pour les parties concernées${q.about.length ? ` (${q.about.join(', ')})` : ''}, et recommande-m’en une. Une fois que j’ai décidé, mets à jour plan.json et architecture.json en conséquence et retire la question de la liste questions de plan.json.`, reconstruire].join('\n'),
    });
  });

  // ---------- bouts qui ne mènent nulle part ----------
  const appeles = new Set(graphe.links.filter((l) => l.k === 'http' && l.calls).flatMap((l) => l.calls.map(([iRoute]) => iRoute)));
  const routesInutilisees = routes.map((r, i) => ({ r, i })).filter(({ r, i }) => !appeles.has(i) && !['webhook', 'internal', 'public'].includes(accesDe(r)));
  if (routesInutilisees.length) problemes.push({
    id: 'plan-unused-endpoints', kind: 'unused-file', severity: 'low',
    change: `Rien n’appelle ${listerNoms(routesInutilisees.map(({ r }) => texteAdresse(r)))}. Ajoute l’écran ou le service qui doit s’en servir, ou retire-${routesInutilisees.length === 1 ? 'la' : 'les'} si ce n’est pas utile. `,
    title: routesInutilisees.length === 1 ? 'Rien dans le plan n’utilise une adresse du serveur' : `Rien dans le plan n’utilise ${routesInutilisees.length} adresses du serveur`,
    detail: `Aucune page ni aucun service prévu ne ${routesInutilisees.length === 1 ? 'l’appelle' : 'les appelle'}. Soit il manque au plan un écran qui en a besoin, soit ${routesInutilisees.length === 1 ? 'elle n’est pas nécessaire' : 'elles ne sont pas nécessaires'}.`,
    items: routesInutilisees.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(routesInutilisees.slice(0, 24).map(({ i }) => ['r:' + i, 'Aucun appelant prévu'])),
    locations: [],
    fix: [`Revue du plan de la-carte/plan.json : rien dans le plan n’appelle ces adresses du serveur :`, ...routesInutilisees.map(({ r }) => ligne(r)), ``, `Pour chacune, trouve quel écran ou service prévu doit l’appeler et ajoute-la aux "calls" de ce fichier, ou dis-moi qu’elle est inutile et retire-la.`, reconstruire].join('\n'),
  });
  const relies = new Set();
  for (const l of graphe.links) { relies.add(l.a); relies.add(l.b); }
  const fichiersEcrans = new Set((graphe.ecrans || []).map((s) => s.file));
  const fichiersRoutes = new Set(routes.map((r) => r.f));
  const isoles = graphe.files.filter((f) => !relies.has('f:' + f.p) && !fichiersEcrans.has(f.p) && !fichiersRoutes.has(f.p));
  if (isoles.length) problemes.push({
    id: 'plan-loose-files', kind: 'unused-file', severity: 'low',
    change: `${listerNoms(isoles.map((f) => f.p))} ${isoles.length === 1 ? 'n’est relié' : 'ne sont reliés'} à rien. Relie-${isoles.length === 1 ? 'le' : 'les'} à ce qui doit s’en servir, ou retire-${isoles.length === 1 ? 'le' : 'les'}. `,
    title: isoles.length === 1 ? 'Un fichier prévu n’est relié à rien' : `${isoles.length} fichiers prévus ne sont reliés à rien`,
    detail: `Rien dans le plan ne ${isoles.length === 1 ? 'l’utilise' : 'les utilise'}, et ${isoles.length === 1 ? 'il n’utilise' : 'ils n’utilisent'} rien. Cela veut en général dire qu’il manque une liaison dans le plan.`,
    items: isoles.slice(0, 24).map((f) => 'f:' + f.p),
    notes: Object.fromEntries(isoles.slice(0, 24).map((f) => ['f:' + f.p, 'N’est relié à rien dans le plan'])),
    locations: [],
    fix: [`Revue du plan de la-carte/plan.json : ces fichiers prévus ne sont reliés à rien :`, ...isoles.map((f) => `- ${f.p}`), ``, `Ajoute les entrées "uses", "calls", "services" ou "data" qui manquent, ou retire les fichiers inutiles.`, reconstruire].join('\n'),
  });

  const ORDRE = { high: 0, medium: 1, low: 2 };
  problemes.sort((a, b) => ORDRE[a.severity] - ORDRE[b.severity]);
  const resume = { high: 0, medium: 0, low: 0 };
  for (const i of problemes) resume[i.severity]++;
  return { summary: resume, problemes: problemes.slice(0, 40), review: true };
}
