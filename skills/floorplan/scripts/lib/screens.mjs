// Écrans : les pages qu’une personne peut ouvrir dans l’app (routes Next.js, routes React Router, …), pour que la
// carte puisse s’aborder par ce que les gens reconnaissent (« la page de paiement ») plutôt que par des couches de code.
//
// trouverEcrans(src, file) — appelée par scan.mjs pour chaque fichier de code, de config ou de docs, avec son source.
//                          Renvoie les indices bruts d’écran pour ce fichier, rangés dans scan.json files[].ecrans :
//                            { fw, url }                        le fichier lui-même est l’écran (routeurs par fichiers)
//                            { fw, url, comp, spec, files }     une entrée de routeur qui pointe vers un composant (résolu par import)
//                            { fw, url, target }                une config de routeur qui donne le chemin du fichier de l’écran
// construireEcrans(ctx)  — appelée par build.mjs avec { graph, scan, arch, root } une fois le graphe construit.
//                          Renvoie graphe.ecrans : [{ id, url, file, app, fw, name, description, behind: [{ id, note, kind }] }]
//                          kind : screen | part | request | server | data | outside (dans cet ordre, environ 16 éléments).
//
// Pris en charge : Next.js (routeurs app et pages), React Router (<Route> en JSX et objets de routes, v5 à v7, y compris
// la config routes.ts), Vue Router, routes Angular, TanStack Router (createFileRoute), SvelteKit, Remix
// (routes à plat et imbriquées), Nuxt, Astro, Expo Router.

import fs from 'node:fs';
import path from 'node:path';

const P = path.posix;
const LANGAGES_JS = new Set(['typescript', 'javascript', 'vue', 'svelte', 'astro']);

// ======================= côté analyse =======================

export function trouverEcrans(src, fichier) {
  if (fichier.category !== 'code' || !LANGAGES_JS.has(fichier.lang)) return [];
  const p = fichier.path;
  const sortie = [];
  const page = ecranParFichier(p, src);
  if (page) sortie.push(page);
  if (fichier.lang === 'typescript' || fichier.lang === 'javascript' || fichier.lang === 'vue') {
    for (const r of ecransRouteur(src, fichier)) sortie.push(r);
  }
  // dédoublonner à l’intérieur d’un fichier
  const vus = new Set();
  return sortie.filter((s) => { const k = `${s.url}|${s.comp || ''}|${s.spec || ''}|${s.target || ''}`; if (vus.has(k)) return false; vus.add(k); return true; });
}

/** Transforme les segments d’un routeur par fichiers en URL. Renvoie null quand le fichier n’est pas une route (dossiers privés, interceptions). */
function segmentsVersUrl(segments, { indexName: nomIndex = null } = {}) {
  const sortie = [];
  for (let s of segments) {
    if (!s) continue;
    if (/^\(\.+\)/.test(s)) return null;                 // routes interceptées de Next : (.)photo
    if (/^\(.*\)$/.test(s) || s.startsWith('@')) continue; // groupes de routes, emplacements parallèles
    if (s.startsWith('_')) return null;                  // dossiers privés de Next
    if (nomIndex && s === nomIndex) continue;
    s = s.replace(/^\[\[\.\.\.(.+)\]\]$/, '*').replace(/^\[\.\.\.(.+)\]$/, '*').replace(/^\[\[(.+)\]\]$/, ':$1?').replace(/^\[(.+)\]$/, ':$1');
    sortie.push(s);
  }
  return '/' + sortie.join('/');
}

function ecranParFichier(p, src) {
  let m;
  // Routeur app de Next.js : app/**/page.tsx
  if ((m = /(?:^|\/)app\/((?:[^/]+\/)*)page\.(?:tsx|jsx|ts|js|mdx)$/.exec(p))) {
    const url = segmentsVersUrl(m[1].split('/'));
    return url && { fw: 'next-app', url };
  }
  // SvelteKit : src/routes/**/+page.svelte
  if ((m = /(?:^|\/)routes\/((?:[^/]+\/)*)\+page\.svelte$/.exec(p))) {
    const url = segmentsVersUrl(m[1].split('/').map((s) => s.replace(/^\[(\.\.\.)?([^\]=]+)(=[^\]]+)?\]$/, (_, reste, nom) => reste ? '[...x]' : `[${nom}]`)));
    return url && { fw: 'sveltekit', url };
  }
  // Routes par fichiers de TanStack Router : createFileRoute('/products/$id')
  if ((m = /\bcreateFileRoute\(\s*["'`]([^"'`]*)["'`]\s*\)/.exec(src)) && !/__root/.test(p)) {
    const url = normaliserUrl(m[1].replace(/\/_[^/]+/g, '').replace(/\$([A-Za-z_]\w*)/g, ':$1').replace(/\/\$$/, '/*'));
    return url && { fw: 'tanstack', url };
  }
  // Routes par fichiers de Remix / React Router v7 : app/routes/*
  if ((m = /(?:^|\/)app\/routes\/(.+)\.(?:tsx|jsx|ts|js|mdx)$/.exec(p)) && !/react-native/.test(src)) {
    if (!/\bexport\s+default\b/.test(src)) return null; // les routes de ressources (loader/action seulement) ne sont pas des écrans
    let cheminRelatif = m[1];
    if (/(^|\/)route$/.test(cheminRelatif)) cheminRelatif = cheminRelatif.replace(/\/?route$/, '');            // routes en dossier : products.$id/route.tsx
    const segments = [];
    for (const morceau of cheminRelatif.split('/')) for (const brut of morceau.split(/\.(?![^[]*\])/)) {
      let s = brut.replace(/\[(.*?)\]/g, '$1');
      if (s === '_index' || s === 'index') continue;
      if (s.startsWith('_')) continue;                   // mise en page sans chemin
      s = s.replace(/_$/, '');
      if (s === '$') s = '*';
      else if (/^\(\$(\w+)\)$/.test(s)) s = ':' + s.slice(2, -1) + '?';
      else if (/^\((.+)\)$/.test(s)) s = s.slice(1, -1);
      else if (s.startsWith('$')) s = ':' + s.slice(1);
      if (s) segments.push(s);
    }
    return { fw: 'remix', url: '/' + segments.join('/') };
  }
  // Expo Router : app/**/*.tsx qui affiche du React Native
  if ((m = /(?:^|\/)app\/((?:[^/]+\/)*)([^/]+)\.(?:tsx|jsx|ts|js)$/.exec(p)) && /from\s+["'](react-native|expo-router)["']/.test(src)) {
    const base = m[2];
    if (base.startsWith('_') || base.startsWith('+') || /\+api$/.test(base) || /^(page|layout|route)$/.test(base)) return null;
    const url = segmentsVersUrl([...m[1].split('/'), base], { indexName: 'index' });
    return url && { fw: 'expo', url };
  }
  // Routeurs par pages : Next.js (pages/**.tsx), Nuxt (pages/**.vue), Astro (src/pages/**.astro)
  if ((m = /(?:^|\/)pages\/((?:[^/]+\/)*)([^/]+)\.(tsx|jsx|ts|js|vue|astro|mdx?)$/.exec(p))) {
    const [, dossier, base, extension] = m;
    if (/^api\//.test(dossier) || base.startsWith('_') || /\.(test|spec|stories)$/.test(base) || /(^|\/)(components?|_[^/]*)\//.test(dossier)) return null;
    if ((extension === 'ts' || extension === 'js') && !/\bexport\s+default\b/.test(src)) return null;
    const fw = extension === 'vue' ? 'nuxt' : extension === 'astro' ? 'astro' : 'next-pages';
    const url = segmentsVersUrl([...dossier.split('/'), base], { indexName: 'index' });
    return url && { fw, url };
  }
  return null;
}

function normaliserUrl(u) {
  if (u == null) return null;
  let s = String(u).trim().split(/[?#]/)[0];
  s = s.replace(/\(([^()]*)\)/g, (m0, interieur) => (/^[\w-]+$/.test(interieur) ? m0 : '')); // regex de paramètres de Vue :id(\\d+)
  s = ('/' + s).replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/$/, '');
  return s;
}
const joindreUrl = (parent, enfant) => {
  if (enfant == null) return parent;
  if (enfant.startsWith('/')) return normaliserUrl(enfant);
  return normaliserUrl((parent || '') + '/' + enfant);
};
const estFourreTout = (u) => /^\/?(\*\*?|:pathMatch.*|:catchAll.*)$/.test(u);

const ENVELOPPE = /^(Route|Routes|Switch|Navigate|Redirect|Outlet|Suspense|React\.Suspense|Fragment|React\.Fragment|ErrorBoundary|\w*(Guard|Protected|Private|Require\w*|Auth\w*|Provider|Boundary|Layout|Wrapper|Shell))$/;
const choisirComposant = (noms) => noms.filter((n) => !ENVELOPPE.test(n)).pop() || null;

/** nom local -> spécificateur d’import, y compris les imports par défaut et les liaisons lazy(() => import('...')). */
function liaisonsImports(code) {
  const table = new Map();
  for (const m of code.matchAll(/\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)?\s*,?\s*(?:\{([^}]*)\})?\s*(?:\*\s+as\s+([A-Za-z_$][\w$]*))?\s*from\s*["']([^"']+)["']/g)) {
    if (m[1]) table.set(m[1], m[4]);
    if (m[3]) table.set(m[3], m[4]);
    for (const morceau of (m[2] || '').split(',')) {
      const [orig, alias] = morceau.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      if (orig) table.set((alias || orig).trim(), m[4]);
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:React\.)?(?:lazy|loadable|lazyWithRetry|defineAsyncComponent|dynamic)\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) table.set(m[1], m[2]);
  return table;
}

const SIGNAL_ROUTEUR = /createBrowserRouter|createHashRouter|createMemoryRouter|createRoutesFromElements|useRoutes|RouterProvider|createRouter|new\s+(?:Vue)?Router\s*\(|RouteRecordRaw|RouteObject|provideRouter|RouterModule|Routes\s*=\s*\[|\broutes\s*(?::\s*[\w<>[\]\s]+)?=\s*\[/;

function ecransRouteur(src, fichier) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, avant) => avant + ' '.repeat(m.length - avant.length));
  const sortie = [];
  const liaisons = liaisonsImports(code);
  const imbrications = new Map(); // indice -> profondeur d’imbrication ; une mise en page et son enfant index partagent une URL, l’enfant l’emporte
  const fabriquer = (fw, url, composant, spec, imbrication = 0) => {
    if (!url || estFourreTout(url.replace(/^\//, ''))) return;
    spec = spec || (composant ? liaisons.get(composant.split('.')[0]) : null) || null;
    if (!composant && !spec) return;
    const indice = { fw, url, ...(composant ? { comp: composant } : {}), ...(spec ? { spec } : {}) };
    // l’analyseur résout les imports de ce fichier après l’exécution des hooks ; on les lit à la demande quand scan.json est écrit
    if (spec) Object.defineProperty(indice, 'files', { enumerable: true, get: () => (fichier.imports || []).find((i) => i.spec === spec && i.files?.length)?.files });
    imbrications.set(indice, imbrication);
    sortie.push(indice);
  };

  // Config de React Router v7 : app/routes.ts avec route("path", "routes/file.tsx") / index("routes/home.tsx")
  if (/(^|\/)routes\.(ts|js|mjs)$/.test(fichier.path) && /@react-router\/dev\/routes|\b(route|index)\(\s*["']/.test(code)) {
    const appels = [];
    for (const m of code.matchAll(/\b(route|index|layout|prefix)\(\s*/g)) {
      const fin = fermetureAssortie(code, m.index + m[0].length - 1, '(', ')');
      if (fin < 0) continue;
      const args = [...code.slice(m.index, fin).matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
      appels.push({ type: m[1], start: m.index, end: fin, args });
    }
    for (const c of appels) {
      const parents = appels.filter((o) => o !== c && o.start < c.start && o.end > c.end && (o.type === 'route' || o.type === 'prefix')).sort((a, b) => a.start - b.start);
      let base = '';
      for (const o of parents) base = joindreUrl(base, o.args[0]);
      const dossier = P.dirname(fichier.path);
      if (c.type === 'route' && c.args.length >= 2) sortie.push({ fw: 'react-router', url: joindreUrl(base, c.args[0]), target: P.normalize(P.join(dossier, c.args[1])) });
      if (c.type === 'index' && c.args.length >= 1) sortie.push({ fw: 'react-router', url: base || '/', target: P.normalize(P.join(dossier, c.args[0])) });
    }
    if (sortie.length) return sortie;
  }

  // JSX : <Route path="x" element={<X/>} />, les routes imbriquées joignent leurs chemins
  if (/<Route\b/.test(code)) {
    const pile = [];
    for (const m of code.matchAll(/<Route\b|<\/Route\s*>/g)) {
      if (m[0].startsWith('</')) {
        const sommet = pile.pop();
        if (sommet && sommet.pendingAt != null && !sommet.done) {
          const interieur = code.slice(sommet.pendingAt, m.index);
          if (!/<Route\b/.test(interieur)) fabriquer('react-router', sommet.url, choisirComposant([...interieur.matchAll(/<([A-Z][\w.]*)/g)].map((x) => x[1])), null, pile.length + 1);
        }
        continue;
      }
      const fin = finBalise(code, m.index + 6);
      if (fin < 0) continue;
      const attributs = code.slice(m.index + 6, fin);
      const autoFermante = /\/\s*$/.test(attributs);
      const parent = pile.length ? pile[pile.length - 1].url : '';
      const attrChemin = /\bpath\s*=\s*(?:["']([^"']*)["']|\{\s*["'`]([^"'`]*)["'`]\s*\})/.exec(attributs);
      const estIndex = /(^|\s)index(\s|=\{?true|\/|$)/.test(attributs);
      const url = attrChemin ? joindreUrl(parent, attrChemin[1] ?? attrChemin[2]) : (parent || '/');
      const el = /\belement\s*=\s*\{/.exec(attributs);
      let composant = null;
      if (el) { const fermeture = fermetureAssortie(attributs, el.index + el[0].length - 1, '{', '}'); composant = choisirComposant([...attributs.slice(el.index, fermeture > 0 ? fermeture : undefined).matchAll(/<([A-Z][\w.]*)/g)].map((x) => x[1])); }
      composant = composant || /\b[Cc]omponent\s*=\s*\{\s*([A-Z][\w$.]*)\s*\}/.exec(attributs)?.[1] || null;
      if (!composant) { const r = /\brender\s*=\s*\{/.exec(attributs); if (r) composant = choisirComposant([...attributs.slice(r.index).matchAll(/<([A-Z][\w.]*)/g)].map((x) => x[1])); }
      const specDiffere = /\blazy\s*=\s*\{[^}]*import\(\s*["']([^"']+)["']/.exec(attributs)?.[1];
      if ((attrChemin || estIndex) && (composant || specDiffere)) fabriquer('react-router', url, composant, specDiffere, pile.length);
      if (!autoFermante) pile.push({ url: attrChemin ? url : parent, pendingAt: (attrChemin || estIndex) && !composant && !specDiffere ? fin + 1 : null, done: !!composant });
    }
  }

  // Objets de routes : { path: 'x', element: <X/> | component: X | component: () => import('./X.vue'), children: [...] }
  if (SIGNAL_ROUTEUR.test(code)) {
    const objets = [];
    for (const m of code.matchAll(/\bpath\s*:\s*(["'`])([^"'`]*)\1|\bindex\s*:\s*true\b/g)) {
      const ouverture = accoladeEnglobante(code, m.index);
      if (ouverture < 0) continue;
      const fermeture = fermetureAssortie(code, ouverture, '{', '}');
      if (fermeture < 0) continue;
      if (objets.some((r) => r.open === ouverture)) { const r = objets.find((x) => x.open === ouverture); if (m[2] != null) r.path = m[2]; continue; }
      objets.push({ open: ouverture, close: fermeture, path: m[2] ?? null, index: m[2] == null });
    }
    for (const r of objets) {
      const propre = masquerImbriques(code.slice(r.open + 1, r.close));
      if (/\bredirect(To)?\s*:/.test(propre) && !/\b(element|component|Component)\s*:/.test(propre)) continue;
      const parents = objets.filter((o) => o !== r && o.open < r.open && o.close > r.close).sort((a, b) => a.open - b.open);
      let base = '';
      for (const o of parents) if (o.path != null) base = joindreUrl(base, o.path);
      const url = r.path != null ? joindreUrl(base, r.path) : (base || '/');
      const brut = code.slice(r.open + 1, r.close);
      let composant = null, spec = null;
      const el = /\belement\s*:\s*</.exec(propre);
      if (el) composant = choisirComposant([...propre.slice(el.index).split(/,\s*\n/)[0].matchAll(/<([A-Z][\w.]*)/g)].map((x) => x[1]));
      composant = composant || /\b(?:component|Component)\s*:\s*([A-Z][\w$.]*)/.exec(propre)?.[1] || null;
      if (!composant) spec = /\b(?:component|Component|lazy|loadComponent|element)\s*:[^,\n]*?import\(\s*["']([^"']+)["']/.exec(brut.replace(/\bchildren\s*:\s*\[[\s\S]*$/, ''))?.[1] || null;
      if (composant || spec) fabriquer(/\.vue["']|createRouter|VueRouter|RouteRecordRaw/.test(code) ? 'vue-router' : /RouterModule|provideRouter|loadComponent/.test(code) ? 'angular' : 'react-router', url, composant, spec, parents.length);
    }
  }
  const meilleur = new Map();
  for (const h of sortie) if (!meilleur.has(h.url) || (imbrications.get(h) || 0) > (imbrications.get(meilleur.get(h.url)) || 0)) meilleur.set(h.url, h);
  return sortie.filter((h) => meilleur.get(h.url) === h);
}

/** Position du '>' qui ferme une balise JSX ouvrante commençant en i (saute les accolades et les chaînes). */
function finBalise(s, i) {
  let profondeur = 0, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') profondeur++;
    else if (c === '}') profondeur--;
    else if (c === '>' && profondeur === 0) return i;
  }
  return -1;
}
function fermetureAssortie(s, i, ouverture, fermeture) {
  let profondeur = 0, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === ouverture) profondeur++;
    else if (c === fermeture && --profondeur === 0) return i;
  }
  return -1;
}
function accoladeEnglobante(s, i) {
  let profondeur = 0;
  for (let j = i - 1; j >= 0; j--) {
    const c = s[j];
    if (c === '}' || c === ']') profondeur++;
    else if (c === '{' || c === '[') { if (profondeur === 0) return c === '{' ? j : -1; profondeur--; }
  }
  return -1;
}
/** Efface les {...} et [...] imbriqués pour ne garder que les clés propres d’un objet (les tableaux children disparaissent). */
function masquerImbriques(s) {
  let sortie = '', profondeur = 0;
  for (const c of s) {
    if (c === '{' || c === '[') { profondeur++; sortie += profondeur === 1 ? c : ' '; continue; }
    if (c === '}' || c === ']') { sortie += profondeur === 1 ? c : ' '; profondeur = Math.max(0, profondeur - 1); continue; }
    sortie += profondeur ? (c === '\n' ? '\n' : ' ') : c;
  }
  return sortie;
}

// ======================= côté construction =======================

const KIT_UI = /(^|\/)(components\/(ui|common|shared|primitives|base|icons?|layout)|ui|primitives)\//i;
const UTILITAIRE = /(^|\/)(utils?|helpers?|constants?|types?|typings|styles?|theme|icons?|config|i18n|locales?)(\/|\.[a-z]+$)|\.d\.ts$|(^|\/)(index|globals?)\.(css|scss)$/i;
const DE_TEST = /(^|\/)(tests?|__tests__|spec|e2e|cypress|playwright|__mocks__|fixtures|stories)(\/|$)|\.(test|spec|stories)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/i;
const CHEMIN_DONNEES = /(^|\/)(models?|schemas?|entities|entity|db|database|repositor(y|ies)|dao|tables?|prisma|orm)(\/|\.[a-z]+$|_)/i;
const LIBELLE_BASE = /postgres|mysql|maria|sqlite|mongo|redis|\bdatabase\b(?!s)|\bdb\b|supabase|firebase|firestore|dynamo|prisma|planetscale|cockroach|\bsql\b/i;
const VERBES_LECTURE = /^(list|get|fetch|load|search|find|look|lookup|check|export|download|preview|calculate|compute|count|show|view|read|poll|ping|generate|validate|verify|resolve|suggest|autocomplete|lister|obtenir|récupérer|charger|chercher|rechercher|trouver|consulter|vérifier|exporter|télécharger|prévisualiser|calculer|compter|afficher|voir|lire|interroger|générer|valider|résoudre|suggérer|compléter)s?$/;
const PAQUET_BASE =/sqlalchemy|psycopg|\bpg\b|postgres|mysql|mongo|prisma|redis|sqlite|knex|typeorm|sequelize|drizzle|supabase|firebase|dynamo|gorm|diesel|activerecord/i;
const CHEMIN_AUTH = /(^|\/)(auth|middlewares?|decorators?|permissions?|security|extensions)(\/|\.[a-z]+$|_)/i;
const INFINITIFS = new Set('passer réserver réclamer voir lire écrire publier envoyer poster renommer renouveler révoquer accorder demander notifier partager attacher détacher lier délier accepter refuser rejeter décliner finaliser verrouiller déverrouiller libérer retenir estimer compter étiqueter filtrer trier signaler suivre activer désactiver suspendre reprendre mettre créer ajouter modifier enregistrer sauvegarder supprimer retirer effacer rechercher chercher trouver vérifier valider calculer générer actualiser rafraîchir soumettre ajuster émettre utiliser racheter annuler clôturer fermer ouvrir imprimer scanner synchroniser importer exporter téléverser télécharger déplacer transférer affecter assigner archiver restaurer dépublier basculer confirmer terminer traiter connecter déconnecter inviter relancer réessayer renvoyer fusionner scinder dupliquer cloner planifier tester reconstruire recevoir prélever emballer expédier rembourser facturer payer encaisser capturer autoriser lister obtenir récupérer charger consulter prévisualiser afficher interroger résoudre suggérer compléter commander inscrire lancer arrêter démarrer exécuter définir réinitialiser appliquer approuver mesurer comparer migrer réattribuer sélectionner vider purger expirer invalider déclencher consigner signer'.split(' '));
const VERBES = new Set([...INFINITIFS, ...'place book reserve claim view read write post put rename renew rotate revoke grant request notify email share attach detach link unlink accept reject decline finalize lock unlock release hold quote estimate count tag untag filter sort report track subscribe unsubscribe join leave follow rate review comment reply flag block activate deactivate suspend resume pause poll ping backfill seed migrate map match swap replace convert recalculate rerun reprocess regenerate recount reorder restock return exchange weigh label fulfill dispatch deliver build deploy upsert insert fill clear flush purge expire invalidate trigger handle ack list get fetch load create add update edit save delete remove search find look check send start stop run mark apply approve cancel set reset preview calculate compute generate refresh submit record adjust issue redeem void close open print scan sync import export upload download move transfer assign archive restore publish unpublish toggle enable disable confirm complete process verify validate log sign register login logout invite connect disconnect wake retry resend bulk merge split duplicate clone schedule queue push pull test rebuild reprice receive pick pack ship refund charge pay collect capture authorize'.split(' ')]);

export function construireEcrans({ graph: graphe, scan, root: racine }) {
  const fichiers = new Map(graphe.files.map((f) => [f.p, f]));
  const noeuds = new Map(graphe.nodes.map((n) => [n.id, n]));
  const routes = graphe.routes || [];
  const sommetDe = (id) => { let n = noeuds.get(id), garde = 0; while (n?.parent && garde++ < 50) n = noeuds.get(n.parent); return n?.id || id; };
  const typesDe = (id) => { const types = new Set(); let n = noeuds.get(id), garde = 0; while (n && garde++ < 50) { types.add(n.kind); n = noeuds.get(n.parent); } return types; };
  const appDe = (p) => sommetDe(fichiers.get(p)?.n);
  const estTest = (p) => DE_TEST.test(p) || typesDe(fichiers.get(p)?.n).has('test');
  const estDonnee = (p) => typesDe(fichiers.get(p)?.n).has('data') || CHEMIN_DONNEES.test(p);

  // ---------- collecte des indices d’écran ----------
  const fichiersScan = scan.files || [];
  const cheminsParRadical = new Map();
  const radicalDe = (p) => p.replace(/\.(d\.)?[a-z0-9]+$/i, '').replace(/\/index$/, '');
  for (const f of graphe.files) cheminsParRadical.set(radicalDe(f.p), f.p);
  // quels dossiers utilisent Next.js (pour distinguer un routeur pages/ de Next d’un dossier pages/ de composants dans une app React)
  const fichiersNext = new Set((scan.extEdges || []).filter((e) => e.pkg === 'npm:next').map((e) => e.from));
  const utiliseNext = (p) => { const base = p.replace(/(^|\/)(src\/)?pages\/.*$/, '$1'); for (const f of fichiersNext) if (f.startsWith(base)) return true; return false; };
  const liensDepuis = new Map();
  for (const e of scan.edges || []) { if (!liensDepuis.has(e.from)) liensDepuis.set(e.from, []); liensDepuis.get(e.from).push(e.to); }
  const resoudreIndice = (depuis, h) => {
    if (h.target) {
      if (fichiers.has(h.target)) return h.target;
      return cheminsParRadical.get(radicalDe(h.target)) || null;
    }
    const resolus = (h.files || []).filter((x) => fichiers.has(x) && !/\.d\.ts$/.test(x));
    if (resolus.length) return resolus[0];
    if (h.spec) {
      const suffixe = h.spec.replace(/^(\.\.?\/)+|^[@~#]\//, '').replace(/\.(tsx|jsx|ts|js|vue|svelte)$/, '');
      const retrouve = (liensDepuis.get(depuis) || []).find((vers) => radicalDe(vers).endsWith(suffixe));
      if (retrouve && fichiers.has(retrouve)) return retrouve;
      return null;
    }
    return h.comp ? depuis : null; // composant défini dans le fichier du routeur lui-même
  };
  const viaRouteur = []; // entrées de routeur : { url, file, fw }
  const indicesPage = [];
  for (const f of fichiersScan) for (const h of f.ecrans || []) {
    if (!h || typeof h.url !== 'string') continue;
    if (h.comp || h.spec || h.target) { const fichier = resoudreIndice(f.path, h); if (fichier) viaRouteur.push({ url: h.url, file: fichier, fw: h.fw }); }
    else indicesPage.push({ url: h.url, file: f.path, fw: h.fw });
  }
  const fichiersViaRouteur = new Set(viaRouteur.map((r) => r.file));
  const candidats = [...viaRouteur];
  for (const h of indicesPage) {
    if (h.fw === 'next-pages' && (fichiersViaRouteur.has(h.file) || !utiliseNext(h.file))) continue;
    if (h.fw === 'nuxt' && fichiersViaRouteur.has(h.file)) continue;
    candidats.push(h);
  }

  // ---------- index des liens ----------
  const sortie = new Map(), degreEntrant = new Map();
  for (const l of graphe.links || []) {
    if (!sortie.has(l.a)) sortie.set(l.a, []);
    sortie.get(l.a).push(l);
    if (l.k === 'import' && l.a.startsWith('f:') && l.b.startsWith('f:')) degreEntrant.set(l.b, (degreEntrant.get(l.b) || 0) + 1);
  }
  const tailleApp = new Map();
  for (const f of graphe.files) { const a = sommetDe(f.n); tailleApp.set(a, (tailleApp.get(a) || 0) + 1); }
  const bruitAvant = (p) => KIT_UI.test(p) || UTILITAIRE.test(p) || (degreEntrant.get('f:' + p) || 0) >= Math.max(6, Math.round((tailleApp.get(appDe(p)) || 0) * 0.05));
  const estBase = (n) => PAQUET_BASE.test((n.packages || []).join(' ')) || LIBELLE_BASE.test(n.label);
  const bruitArriere = (p) => !estDonnee(p) && (UTILITAIRE.test(p) || CHEMIN_AUTH.test(p) || (degreEntrant.get('f:' + p) || 0) >= Math.max(10, Math.round((tailleApp.get(appDe(p)) || 0) * 0.08)));

  // ---------- zones du source (pour ne suivre que ce qu’un écran ou une adresse du serveur utilise vraiment) ----------
  const cacheSource = new Map();
  const lignes = (p) => {
    if (cacheSource.has(p)) return cacheSource.get(p);
    let v = null;
    try { if (racine) v = fs.readFileSync(path.join(racine, p), 'utf8').split('\n'); } catch {}
    cacheSource.set(p, v);
    return v;
  };
  const plagesSymboles = (p) => {
    const s = (fichiers.get(p)?.s || []).map((x) => ({ name: x[0], line: x[2] })).sort((a, b) => a.line - b.line);
    return s.map((x, i) => ({ ...x, end: (s[i + 1]?.line || 1e9) - 1 }));
  };
  /** Plages de lignes d’un fichier couvertes par une cible (null = tout le fichier). */
  const plagesPour = (p, cible) => {
    if (!cible || !cible.size) return null;
    const plagesCiblees = plagesSymboles(p).filter((x) => cible.has(x.name)).map((x) => [x.line, x.end]);
    return plagesCiblees.length ? plagesCiblees : null;
  };
  const texteDe = (p, plages) => {
    const ls = lignes(p); if (!ls) return null;
    if (!plages) return ls.join('\n');
    return plages.map(([a, b]) => ls.slice(a - 1, Math.min(b, ls.length)).join('\n')).join('\n');
  };
  const dansPlages = (ligne, plages) => !plages || plages.some(([a, b]) => ligne >= a && ligne <= b);
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nomRadical = (p) => { const b = P.basename(p).replace(/\.[^.]+$/, ''); return /^(index|__init__|route|page)$/.test(b) ? P.basename(P.dirname(p)) : b; };
  /** Lesquels des liens d’import sortants d’un fichier servent dans `text`, et pour quels noms ou membres. */
  const importsUtilises = (p, texte, filtre) => {
    const resultat = [];
    for (const l of sortie.get('f:' + p) || []) {
      if (l.k !== 'import' || !l.b.startsWith('f:')) continue;
      const vers = l.b.slice(2);
      if (filtre && !filtre(vers)) continue;
      if (texte == null) { resultat.push({ to: vers, focus: cibleNommee(l.names) }); continue; }
      const noms = (l.names || []).filter((n) => n !== 'default' && n !== '*');
      if (noms.length) {
        const retrouve = noms.filter((n) => new RegExp(`(^|[^\\w$.])${echapper(n)}\\b`).test(texte));
        if (!retrouve.length) continue;
        const membres = new Set(), pos = new Map(); // pos : où chaque membre est utilisé pour la première fois (le plus tôt passe en premier)
        for (const n of retrouve) for (const m of texte.matchAll(new RegExp(`\\b${echapper(n)}\\.(\\w+)`, 'g'))) {
          const k = `${n}.${m[1]}`;
          membres.add(k);
          if (!pos.has(k)) pos.set(k, m.index / texte.length);
        }
        resultat.push({ to: vers, focus: new Set(retrouve), members: membres.size ? membres : null, pos });
      } else {
        // import de module (python `from pkg import module [as alias]`, `import * as alias`) : le nom du module
        // ou son alias dans le texte signifie qu’il est utilisé, et ce qu’on en appelle resserre la cible
        const radical = nomRadical(vers);
        const toutLeTexte = (lignes(p) || []).join('\n');
        const pseudos = [radical, ...[...toutLeTexte.matchAll(new RegExp(`\\b${echapper(radical)}["']?\\s+as\\s+([A-Za-z_$][\\w$]*)`, 'g'))].map((m) => m[1]),
          ...[...toutLeTexte.matchAll(new RegExp(`\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["'][^"']*${echapper(radical)}["']`, 'g'))].map((m) => m[1])];
        const utilise = pseudos.some((a) => new RegExp(`\\b${echapper(a)}\\b`, a === radical ? 'i' : '').test(texte));
        if (!utilise && !(l.names || []).includes('default')) continue;
        const membres = new Set();
        for (const a of pseudos) for (const m of texte.matchAll(new RegExp(`\\b${echapper(a)}\\.(\\w+)`, 'g'))) membres.add(m[1]);
        resultat.push({ to: vers, focus: membres.size ? membres : null });
      }
    }
    return resultat;
  };
  const cibleNommee = (noms) => { const n = (noms || []).filter((x) => x !== 'default' && x !== '*'); return n.length ? new Set(n) : null; };
  /** Le membre d’objet dans lequel se trouve une ligne d’appel (`productAPI.getAll`), trouvé en remontant jusqu’à une ligne `key:` moins indentée. */
  const membreA = (p, ligne, ligneSymbole, nomSymbole) => {
    const ls = lignes(p); if (!ls) return null;
    const indent = (s) => s.match(/^\s*/)[0].length;
    const CLE = /^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*(?::|\(|=\s*(?:async\s*)?\()/;
    const MOTS_CLES = /^(if|for|while|switch|catch|return|function|await|typeof|new|else|do|try|with|const|let|var|throw|yield)$/;
    const cleDe = (s) => { const m = CLE.exec(s); return m && !MOTS_CLES.test(m[1]) ? m[1] : null; };
    const propre = ligne > ligneSymbole && cleDe(ls[ligne - 1] || '');
    if (propre) return `${nomSymbole}.${propre}`; // membre sur une ligne : `list: () => api.get('/x')`
    // la ligne `key:` / `method(` la plus extérieure au-dessus de l’appel, sous la ligne du symbole lui-même
    let min = indent(ls[ligne - 1] || ''), trouve = null;
    for (let i = ligne - 1; i > ligneSymbole; i--) {
      const s = ls[i - 1] || ''; if (!s.trim()) continue;
      const d = indent(s);
      if (d < min) { const k = cleDe(s); if (k) { trouve = k; min = d; } }
    }
    return trouve && `${nomSymbole}.${trouve}`;
  };
  const symboleA = (p, ligne) => { let meilleur = null; for (const r of plagesSymboles(p)) if (r.line <= ligne) meilleur = r; return meilleur; };

  // ---------- notes des adresses du serveur ----------
  const minusculeInitiale = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const noteRoute = (r) => {
    const nom = String(r.name || '').trim();
    if (!nom) return 'Demande quelque chose au serveur';
    const premier = nom.split(/\s+/)[0].toLowerCase();
    const garderCasse = /^[A-Z0-9]{2,}/.test(nom.split(/\s+/)[0]);
    const corps = garderCasse ? nom : minusculeInitiale(nom);
    // « Passer la commande » → « Demande au serveur de passer la commande » ; « Liste des produits » → « Demande au serveur : liste des produits » ; un nom de fonction anglais du projet → « Demande au serveur l’action « place order » »
    const estVerbe = r.m === 'GET' ? VERBES_LECTURE.test(premier) : VERBES.has(premier) || VERBES.has(premier.replace(/e?s$/, '')) || (!/s$/.test(premier) && nom.split(/\s+/).length > 1);
    if (INFINITIFS.has(premier)) return `Demande au serveur ${/^[aeiouyàâäéèêëîïôöùûüœh]/i.test(corps) ? 'd’' : 'de '}${corps}`;
    if (estVerbe) return `Demande au serveur l’action « ${corps} »`;
    return /^(le|la|les|un|une|des|du|l['’])\b/i.test(corps) ? `Demande au serveur ${corps}` : `Demande au serveur : ${corps}`;
  };
  const urlLisible = (url) => {
    const segments = url.split('/').filter(Boolean);
    if (!segments.length) return 'Accueil';
    const dernier = [...segments].reverse().find((s) => !s.startsWith(':') && s !== '*') || 'Page';
    const mot = dernier.replace(/[-_]+/g, ' ');
    return mot.charAt(0).toUpperCase() + mot.slice(1) + (segments[segments.length - 1].startsWith(':') ? ' (un élément)' : '');
  };
  const noteFront = (p, profondeur, nomParent) => {
    const b = P.basename(p);
    if (/^use[A-Z]/.test(b) || /(^|\/)hooks?\//.test(p)) return 'Logique utilisée par cet écran';
    if (/(^|\/)(contexts?|stores?|state|atoms)\//i.test(p) || /(Context|Provider|Store|[-_.]store|slice|atoms?)\.[jt]sx?$/.test(b)) return 'État partagé utilisé par cet écran';
    if (/^[a-z]/.test(b) && /\.(ts|js|mjs)$/.test(b)) {
      return (sortie.get('f:' + p) || []).some((l) => l.k === 'http') || /api|client|service|quer(y|ies)|requests?/i.test(b) ? 'Échange avec le serveur pour cet écran' : 'Code d’aide utilisé par cet écran';
    }
    return profondeur <= 1 ? 'Un élément de cet écran' : `Fait partie de ${nomParent}`;
  };

  // ---------- derrière : parcours depuis le fichier de l’écran ----------
  function derriere(page, app, url) {
    const typeApp = (id) => noeuds.get(id)?.kind;
    const avantOk = (p) => fichiers.has(p) && !estTest(p) && (appDe(p) === app || ['ui', 'library', 'feature'].includes(typeApp(appDe(p))));
    // 1) parcours du front avec une cible (quels exports de chaque fichier servent vraiment)
    const vus = new Map(); // chemin -> { depth, focus:Set|null(tout), members:Set|null, parent }
    const fileAttente = [{ p: page, depth: 0, focus: null, members: null, parent: null }];
    // un fichier atteint deux fois sert pour la réunion des deux raisons ; focus/members à null veut dire « tout »
    const reunir = (a, b) => (a && b ? new Set([...a, ...b]) : null);
    const fusionner = (courant, nouveau) => {
      const cible = reunir(courant.focus, nouveau.focus), membres = reunir(courant.members, nouveau.members);
      const aChange = (cible?.size ?? -1) !== (courant.focus?.size ?? -1) || (membres?.size ?? -1) !== (courant.members?.size ?? -1) || nouveau.depth < courant.depth;
      return aChange ? { ...courant, focus: cible, members: membres, depth: Math.min(courant.depth, nouveau.depth) } : null;
    };
    let garde = 0;
    while (fileAttente.length && garde++ < 400) {
      const entree = fileAttente.shift();
      const precedent = vus.get(entree.p);
      // à quelle distance de l’écran chaque membre est utilisé (les appels de la page passent avant ceux d’un enfant)
      const proximite = precedent?.md || new Map();
      for (const x of entree.members || []) proximite.set(x, Math.min(proximite.get(x) ?? 9, entree.depth - 1 + (entree.pos?.get(x) ?? 0.99) * 0.5));
      const m = precedent ? fusionner(precedent, entree) : entree;
      if (precedent) precedent.md = proximite;
      if (m) m.md = proximite;
      if (!m) continue;
      vus.set(entree.p, m);
      const bruyant = entree.p !== page && bruitAvant(entree.p);
      if (bruyant || m.depth >= 3) continue; // briques partagées : on ne lit que leurs appels
      const texte = texteDe(entree.p, plagesPour(entree.p, m.focus));
      for (const u of importsUtilises(entree.p, texte, avantOk)) {
        if (u.to === page) continue;
        fileAttente.push({ p: u.to, depth: m.depth + 1, focus: u.focus, members: u.members || null, pos: u.pos, parent: entree.p });
      }
    }
    // 2) appels au serveur : les appels HTTP des fichiers visités, dans les parties que cet écran utilise
    const appelsVus = new Map(); // indexRoute -> { order, from }
    let ordre = 0;
    const parProfondeur = [...vus.entries()].sort((a, b) => a[1].depth - b[1].depth);
    for (const [p, v] of parProfondeur) {
      const plages = plagesPour(p, v.focus);
      for (const l of sortie.get('f:' + p) || []) {
        if (l.k !== 'http' || !l.calls) continue;
        for (const [iRoute, ligne] of l.calls) {
          if (iRoute == null || !routes[iRoute] || !dansPlages(ligne, plages)) continue;
          let rang = v.depth + 0.5;
          const symbole = v.focus ? symboleA(p, ligne) : null;
          const membre = symbole && membreA(p, ligne, symbole.line, symbole.name);
          if (membre && v.members && !v.members.has(membre) && [...v.members].some((x) => x.startsWith(symbole.name + '.'))) continue;
          if (membre && v.md?.has(membre)) rang = v.md.get(membre);
          const precedent = appelsVus.get(iRoute);
          if (!precedent) appelsVus.set(iRoute, { order: ordre++, from: p, rank: rang });
          else precedent.rank = Math.min(precedent.rank, rang);
        }
      }
    }
    const listeAppels = [...appelsVus.entries()].sort((a, b) => a[1].rank - b[1].rank || a[1].order - b[1].order).map(([iRoute]) => iRoute);

    // ---------- classer les parties de l’écran ----------
    const motsUrl = new Set(url.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    const donneesFront = [...vus.keys()].filter((p) => p !== page && typesDe(fichiers.get(p)?.n).has('data'));
    const composants = [...vus.entries()].filter(([p]) => p !== page && !bruitAvant(p) && !donneesFront.includes(p)).map(([p, v]) => {
      const f = fichiers.get(p);
      const apparente = p.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length > 3 && motsUrl.has(w));
      const appels = (sortie.get('f:' + p) || []).some((l) => l.k === 'http');
      const score = (v.depth === 1 ? 3 : v.depth === 2 ? 1.5 : 0) + Math.min(3, Math.log10((f?.loc || 1) + 1)) + (apparente ? 1.5 : 0) + (appels ? 1 : 0) - Math.min(2, Math.max(0, (degreEntrant.get('f:' + p) || 0) - 2) / 4);
      return { p, v, score };
    }).sort((a, b) => b.score - a.score);
    const BUDGET = 15; // plus l’écran lui-même
    const nComposants = Math.min(4, composants.length);
    const nAppels = Math.min(listeAppels.length, 4 + Math.min(2, 4 - nComposants));
    const appelsMontres = listeAppels.slice(0, nAppels);

    // 3) côté serveur : le gestionnaire de chaque appel montré, ce que son corps utilise, sur quelques niveaux
    const serveur = new Map(); // chemin -> { score, routes:[ri], role:'handler'|'logic', depth }
    const touchesDonnees = new Map(); // chemin -> Set(noms)
    const touchesExternes = new Map(); // idNoeud -> { count, via }
    const ajouterExterne = (id, via) => { const n = noeuds.get(id); if (!n || n.kind !== 'external') return; const e = touchesExternes.get(id) || { count: 0, via }; e.count++; touchesExternes.set(id, e); };
    const externesDe = (p) => { for (const l of sortie.get('f:' + p) || []) if (l.b.startsWith('n:')) ajouterExterne(l.b.slice(2), p); };
    const arriereOk = (p) => fichiers.has(p) && !estTest(p);
    for (const iRoute of appelsMontres) {
      const r = routes[iRoute];
      const h = r.f;
      if (!fichiers.has(h)) continue;
      const etatGest = serveur.get(h) || { score: 0, routes: [], role: 'handler', depth: 0 };
      etatGest.score += 3; etatGest.routes.push(iRoute); serveur.set(h, etatGest);
      const routeSuivante = routes.filter((x) => x.f === h && x.l > r.l).reduce((m, x) => Math.min(m, x.l), Infinity);
      const corps = texteDe(h, [[r.l, Math.min(routeSuivante - 1, r.l + 400)]]);
      externesDe(h);
      const q = importsUtilises(h, corps, arriereOk).map((u) => ({ ...u, depth: 1, via: iRoute }));
      const visites = new Set([h]);
      while (q.length) {
        const u = q.shift();
        if (visites.has(u.to)) continue;
        visites.add(u.to);
        if (estDonnee(u.to)) {
          const ensemble = touchesDonnees.get(u.to) || new Set();
          for (const n of u.focus || []) ensemble.add(n);
          touchesDonnees.set(u.to, ensemble);
          externesDe(u.to);
          continue;
        }
        if (bruitArriere(u.to)) continue;
        const s = serveur.get(u.to) || { score: 0, routes: [], role: 'logic', depth: u.depth };
        s.score += 2 / u.depth; if (!s.routes.includes(u.via)) s.routes.push(u.via); s.depth = Math.min(s.depth, u.depth);
        serveur.set(u.to, s);
        externesDe(u.to);
        if (u.depth >= 3) continue;
        const texte = texteDe(u.to, plagesPour(u.to, u.focus));
        for (const v of importsUtilises(u.to, texte, arriereOk)) q.push({ ...v, depth: u.depth + 1, via: u.via });
      }
    }
    // services extérieurs avec lesquels l’écran lui-même communique (SDK de paiement, API hébergées), et données qu’il lit
    // directement (frameworks full-stack : une page ou une action serveur qui interroge la base de données)
    for (const p of vus.keys()) externesDe(p);
    for (const p of donneesFront) if (!touchesDonnees.has(p)) touchesDonnees.set(p, new Set());

    const serveurs = [...serveur.entries()].sort((a, b) => (a[1].role === 'handler' ? 0 : 1) - (b[1].role === 'handler' ? 0 : 1) || b[1].score - a[1].score);
    const donnees = [...touchesDonnees.entries()].sort((a, b) => b[1].size - a[1].size);
    const externes = [...touchesExternes.entries()].sort((a, b) => b[1].count - a[1].count);

    // ---------- plafonds : écran → composants → appels → serveur → données → extérieur ----------
    const plafonds = { comp: nComposants, server: Math.min(3, serveurs.length), data: Math.min(2, donnees.length), ext: Math.min(2, externes.length) };
    let reserve = BUDGET - nAppels - plafonds.comp - plafonds.server - plafonds.data - plafonds.ext;
    const maximums = { comp: 6, server: 5, ext: 3, data: 3 };
    const dispo = { comp: composants.length, server: serveurs.length, ext: externes.length, data: donnees.length };
    for (const k of ['comp', 'server', 'ext', 'data']) { const supplement = Math.max(0, Math.min(reserve, Math.min(maximums[k], dispo[k]) - plafonds[k])); plafonds[k] += supplement; reserve -= supplement; }

    const nom = (p) => fichiers.get(p)?.name || nomRadical(p);
    const elements = [{ id: 'f:' + page, note: 'L’écran lui-même', kind: 'screen' }];
    for (const c of composants.slice(0, plafonds.comp)) elements.push({ id: 'f:' + c.p, note: noteFront(c.p, c.v.depth, nom(c.v.parent || page)), kind: 'part' });
    for (const iRoute of appelsMontres) elements.push({ id: 'r:' + iRoute, note: noteRoute(routes[iRoute]), kind: 'request' });
    for (const [p, s] of serveurs.slice(0, plafonds.server)) {
      const nomsRoutes = s.routes.map((iRoute) => routes[iRoute]?.name).filter(Boolean);
      const premier = nomsRoutes[0] ? `« ${nomsRoutes[0]} »` : 'ces appels';
      const reste = nomsRoutes.length > 1 ? ` et ${nomsRoutes.length - 1} autre${nomsRoutes.length > 2 ? 's' : ''}` : '';
      elements.push({ id: 'f:' + p, note: s.role === 'handler' ? `Code du serveur qui gère ${premier}${reste}` : `Fait le travail derrière ${premier}${reste}`, kind: 'server' });
    }
    for (const [p, noms] of donnees.slice(0, plafonds.data)) {
      const nomsCourts = [...noms].filter((n) => /^[A-Z][a-z]/.test(n)).sort((a, b) => a.length - b.length).slice(0, 2).map((n) => n.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
      elements.push({ id: 'f:' + p, note: nomsCourts.length ? `Conserve les enregistrements : ${nomsCourts.join(', ')}` : 'Données enregistrées que ce fichier lit ou modifie', kind: 'data' });
    }
    for (const [id, e] of externes.slice(0, plafonds.ext)) {
      const n = noeuds.get(id);
      elements.push({ id: 'n:' + id, note: estBase(n) ? 'L’endroit où les données sont conservées' : `Service extérieur, utilisé par ${nom(e.via)}`, kind: 'outside' });
    }
    return elements;
  }

  // ---------- assemblage ----------
  const ecrans = new Map();
  for (const c of candidats) {
    if (!fichiers.has(c.file) || estTest(c.file)) continue;
    const app = appDe(c.file);
    const url = normaliserUrl(c.url) || '/';
    const id = `screen:${app}:${url}`;
    if (ecrans.has(id)) continue;
    const f = fichiers.get(c.file);
    ecrans.set(id, { id, url, file: c.file, app, fw: c.fw, name: f.auto && /\b(page|index|route)\b/i.test(f.name) ? urlLisible(url) : f.name || urlLisible(url), description: f.d || '' });
  }
  const liste = [...ecrans.values()].sort((a, b) => a.app.localeCompare(b.app) || a.url.localeCompare(b.url));
  for (const s of liste) {
    try { s.behind = derriere(s.file, s.app, s.url); } catch (e) { s.behind = [{ id: 'f:' + s.file, note: 'L’écran lui-même', kind: 'screen' }]; }
  }
  return liste;
}
