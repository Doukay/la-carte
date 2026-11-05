// Outils communs : chemins, motifs (globs), classement des fichiers, git et découverte du code.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const versPosix = (p) => p.replace(/\\/g, '/');
export const cheminRelatif = (depuis, vers) => versPosix(path.relative(depuis, vers)) || '.';

// ---------- motifs (globs) ----------

const CARACTERES_MOTIF = /[*?{[]/;

export function motifVersRegex(motif) {
  const g = versPosix(motif).replace(/^\.\//, '').replace(/\/$/, '');
  let regex = '';
  let accolades = 0;
  for (let i = 0; i < g.length; ) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const enDebut = i === 0 || g[i - 1] === '/';
        const enFin = i + 2 === g.length || g[i + 2] === '/';
        if (enDebut && enFin) {
          if (i + 2 === g.length) { regex += '.*'; i += 2; }
          else { regex += '(?:.*/)?'; i += 3; }
          continue;
        }
        regex += '.*'; i += 2; continue;
      }
      regex += '[^/]*'; i++; continue;
    }
    if (c === '?') { regex += '[^/]'; i++; continue; }
    if (c === '{') { accolades++; regex += '(?:'; i++; continue; }
    if (c === '}' && accolades) { accolades--; regex += ')'; i++; continue; }
    if (c === ',' && accolades) { regex += '|'; i++; continue; }
    // un segment entier comme [id], [...slug] ou [[...slug]] est un nom de dossier (Next.js, SvelteKit), pas une classe de caractères
    if (c === '[' && (i === 0 || g[i - 1] === '/')) {
      const fin = g.indexOf('/', i) < 0 ? g.length : g.indexOf('/', i);
      const segment = g.slice(i, fin);
      if (/^\[\[?(\.\.\.)?[A-Za-z_$][\w$-]*\]\]?$/.test(segment)) { regex += segment.replace(/[.[\]$\\]/g, '\\$&'); i = fin; continue; }
    }
    if (c === '[') {
      const j = g.indexOf(']', i + 1);
      if (j > i) { regex += '[' + g.slice(i + 1, j).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']'; i = j + 1; continue; }
    }
    regex += c.replace(/[.+^$()|\\\]]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + regex + '$');
}

/** Compile un motif. Un motif sans joker correspond aussi à tout ce qui se trouve dessous, comme un dossier. */
export function compilerMotif(motif) {
  const g = versPosix(motif).replace(/^\.\//, '').replace(/\/$/, '');
  const prefixeLitteral = g.split(CARACTERES_MOTIF)[0];
  if (!CARACTERES_MOTIF.test(g)) {
    return { glob: motif, specificity: g.length, test: (p) => p === g || p.startsWith(g + '/') };
  }
  // Un motif qui nomme des dossiers (src/components/{a,b}) correspond aussi à tout ce qu'ils contiennent.
  const regex = motifVersRegex(g);
  const dessous = motifVersRegex(g + '/**');
  return { glob: motif, specificity: prefixeLitteral.length, test: (p) => regex.test(p) || dessous.test(p) };
}

// ---------- classement des fichiers ----------

const LANGAGE_PAR_EXT = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala',
  '.cs': 'csharp', '.fs': 'fsharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.dart': 'dart',
  '.c': 'c', '.h': 'c', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.m': 'objc', '.mm': 'objc',
  '.ex': 'elixir', '.exs': 'elixir', '.erl': 'erlang', '.clj': 'clojure', '.lua': 'lua', '.r': 'r', '.jl': 'julia',
  '.zig': 'zig', '.elm': 'elm', '.hs': 'haskell', '.ml': 'ocaml', '.groovy': 'groovy',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell', '.psm1': 'powershell',
  '.sql': 'sql', '.tf': 'terraform', '.proto': 'protobuf', '.graphql': 'graphql', '.gql': 'graphql',
  '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
  '.html': 'html', '.htm': 'html', '.ejs': 'html', '.hbs': 'html', '.jinja': 'html', '.j2': 'html', '.njk': 'html',
};
const EXT_CONFIG = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.gradle', '.properties', '.env']);
const NOMS_CONFIG = /^(dockerfile.*|makefile|procfile|justfile|\.env\..*|\.?[\w-]*rc|gemfile|rakefile|cargo\.toml|go\.mod|pyproject\.toml|setup\.cfg|requirements.*\.txt)$/i;
const JSON_DE_CONFIG = /^(package|tsconfig.*|jsconfig|composer|manifest|app|components|turbo|nx|lerna|angular|firebase|vercel|now|renovate|tslint|.?eslintrc|.?babelrc|.?prettierrc|.*.config|.*rc|settings|launch|tasks|deno|biome|project|workspace|devcontainer|cdk|serverless|appsettings.*|openapi|swagger).json$/i;
const EXT_DOCS = new Set(['.md', '.mdx', '.rst', '.adoc', '.txt']);
const EXT_DONNEES = new Set(['.csv', '.tsv', '.jsonl', '.ndjson', '.parquet', '.sqlite', '.db', '.xlsx', '.xls', '.avro']);
const EXT_RESSOURCES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.webm', '.mov', '.pdf', '.zip', '.gz', '.tar', '.tgz', '.7z', '.jar', '.wasm', '.exe', '.dll', '.so', '.dylib', '.bin']);
const NOMS_VERROUS = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|poetry\.lock|pipfile\.lock|cargo\.lock|go\.sum|composer\.lock|gemfile\.lock|.*\.lock)$/i;
const MOTIF_GENERE = /(\.min\.(js|css)$|\.map$|\.tsbuildinfo$|\.pyc$|\.pyo$|\.class$|\.o$|(^|\/)next-env\.d\.ts$)/i;

/** Dossiers qui ne valent jamais la peine d'être analysés, même si un dépôt les suit. */
export const DOSSIERS_TOUJOURS_IGNORES = new Set([
  'node_modules', '.git', '.pnpm-store', '.yarn', '__pycache__', '.venv', 'venv', 'site-packages',
  '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.next', '.nuxt', '.svelte-kit', '.turbo',
  '.parcel-cache', '.gradle', '.idea',
]);

/** Le dossier qui contient la carte, à la racine du code. Les cartes d'avant le changement de nom utilisaient show-code/. */
export const DOSSIER_CARTE = 'la-carte';
export const ANCIEN_DOSSIER_CARTE = 'show-code';
/** Vrai pour un dossier qui contient une carte, pour qu'un dossier du projet qui s'appelle par hasard « la-carte » ne soit pas pris pour une carte. */
export const estDossierCarte = (d) => ['architecture.json', 'plan.json', 'graphe.json', '.cache'].some((f) => fs.existsSync(path.join(d, f)));
/**
 * Garde le dossier de la carte hors de git : son propre .gitignore ignore tout ce qu'il contient, lui compris,
 * donc rien ne change dans les fichiers suivis du projet. Renvoie un avertissement quand git suit déjà des
 * fichiers dedans (les ignorer ne les retire pas du suivi), sinon null.
 */
export function garderHorsGit(dossier) {
  const gi = path.join(dossier, '.gitignore');
  const attendu = '# Ce dossier reste hors de git : ceci ignore tout ce qui est dans ce dossier, ce fichier compris.\n*\n';
  fs.mkdirSync(dossier, { recursive: true });
  try { if (!fs.existsSync(gi) || fs.readFileSync(gi, 'utf8') !== attendu) fs.writeFileSync(gi, attendu); } catch {}
  const suivis = (git(dossier, ['ls-files', '--', '.']) || '').split('\n').filter(Boolean);
  if (!suivis.length) return null;
  const nomDossier = path.basename(dossier);
  return `${suivis.length} fichier(s) de ${nomDossier}/ étaient déjà enregistrés dans git ; ils restent suivis tant que tu ne lances pas : git rm -r --cached ${nomDossier}  (les fichiers restent sur ton disque)`;
}

/** Le dossier de la carte pour une racine de code. */
export function dossierCarte(racine) {
  const dossier = path.join(racine, DOSSIER_CARTE);
  if (fs.existsSync(dossier) && !estDossierCarte(dossier) && fs.readdirSync(dossier).length) {
    console.error(`✗ ${DOSSIER_CARTE}/ existe déjà ici et ce n'est pas une carte (il fait partie du projet). Ajoute --out <dossier> pour mettre la carte ailleurs.`);
    process.exit(1);
  }
  return dossier;
}
/** Dossiers en plus qu'on saute quand on parcourt hors de git (là où .gitignore ne peut pas aider). */
export const DOSSIERS_IGNORES_PARCOURS = new Set([...DOSSIERS_TOUJOURS_IGNORES, 'dist', 'build', 'out', 'target', 'coverage', '.cache', 'vendor', 'bin', 'obj', 'env', '.vscode', '.claude']);

export function classer(cheminRel, octets) {
  const base = path.posix.basename(cheminRel).toLowerCase();
  const ext = path.posix.extname(base);
  if (MOTIF_GENERE.test(cheminRel)) return { category: 'generated', lang: null };
  if (NOMS_VERROUS.test(base)) return { category: 'lock', lang: null };
  if (ext === '.log' || base.endsWith('.log')) return { category: 'log', lang: null };
  if (EXT_RESSOURCES.has(ext)) return { category: 'asset', lang: null };
  if (EXT_DONNEES.has(ext)) return { category: 'data', lang: null };
  if (LANGAGE_PAR_EXT[ext]) {
    if (ext === '.svg') return { category: 'asset', lang: null };
    return { category: 'code', lang: LANGAGE_PAR_EXT[ext] };
  }
  if (ext === '.json' && (octets > 100_000 || !JSON_DE_CONFIG.test(base))) return { category: 'data', lang: null };
  if (EXT_CONFIG.has(ext) || NOMS_CONFIG.test(base)) return { category: 'config', lang: ext ? ext.slice(1) : base };
  if (EXT_DOCS.has(ext)) return { category: 'docs', lang: null };
  return { category: 'other', lang: null };
}

// ---------- git ----------

export function git(dossierCourant, parametres) {
  try {
    return execFileSync('git', ['-C', dossierCourant, ...parametres], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trimEnd();
  } catch {
    return null;
  }
}

export function infosGit(dossier) {
  const tete = git(dossier, ['rev-parse', 'HEAD']);
  const branche = git(dossier, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const distant = git(dossier, ['config', '--get', 'remote.origin.url']);
  return { head: tete, branch: branche, remote: distant ? distant.replace(/\/\/[^@/]+@/, '//') : null };
}

/** Les fichiers que git considère comme faisant partie du dépôt : suivis + non suivis mais non ignorés. */
export function fichiersGit(dossier) {
  const sortie = git(dossier, ['ls-files', '-co', '--exclude-standard', '-z']);
  if (sortie == null) return null;
  return [...new Set(sortie.split('\0').filter(Boolean))].map(versPosix);
}

/** Si dossier/.git est un fichier qui pointe vers le worktrees/ d'un autre dépôt, renvoie le dossier de travail de ce dépôt. */
function principalDuWorktree(dossier) {
  const pointGit = path.join(dossier, '.git');
  let statut;
  try { statut = fs.statSync(pointGit); } catch { return null; }
  if (!statut.isFile()) return null;
  const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(pointGit, 'utf8'));
  if (!m) return null;
  const dossierGit = path.resolve(dossier, m[1].trim());
  const indice = versPosix(dossierGit).lastIndexOf('/.git/worktrees/');
  if (indice === -1) return null; // sous-module ou autre renvoi : on le traite comme un dépôt normal
  return path.resolve(versPosix(dossierGit).slice(0, indice));
}

// ---------- découverte ----------

/**
 * Parcourt la racine du code et trouve tous les dépôts git qu'elle contient. On n'entre pas dans les dépôts
 * (git ls-files s'en charge). Les fichiers isolés, hors de tout dépôt, sont relevés aussi.
 * Les worktrees liés à un dépôt qui est lui-même dans le code sont sautés comme doublons.
 */
export function decouvrir(racine, { includeWorktrees: inclureWorktrees = false, maxLooseFiles: maxFichiersIsoles = 5000 } = {}) {
  const depots = [];
  const isoles = [];
  const ignores = [];

  const parcourir = (dossier, profondeur) => {
    if (fs.existsSync(path.join(dossier, '.git'))) {
      depots.push({ abs: dossier, path: cheminRelatif(racine, dossier), worktreeOf: principalDuWorktree(dossier) });
      return;
    }
    if (profondeur > 8) return;
    let entrees;
    try { entrees = fs.readdirSync(dossier, { withFileTypes: true }); } catch { return; }
    if (entrees.filter((e) => e.isFile()).length > 500) { ignores.push({ path: cheminRelatif(racine, dossier), reason: 'plus de 500 fichiers hors de git (export de données ?)' }); return; }
    for (const e of entrees) {
      const absolu = path.join(dossier, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (DOSSIERS_IGNORES_PARCOURS.has(e.name) || (e.name.startsWith('.') && e.name !== '.github')) {
          if (!['.git', 'node_modules', '__pycache__'].includes(e.name)) ignores.push({ path: cheminRelatif(racine, absolu), reason: 'dossier ignoré' });
          continue;
        }
        parcourir(absolu, profondeur + 1);
      } else if (e.isFile()) {
        if (isoles.length < maxFichiersIsoles) isoles.push(cheminRelatif(racine, absolu));
      }
    }
  };
  parcourir(racine, 0);

  // On retire les worktrees en double.
  const normaliser = (p) => versPosix(path.resolve(p)).toLowerCase();
  const principaux = new Set(depots.filter((r) => !r.worktreeOf).map((r) => normaliser(r.abs)));
  const principauxVus = new Set();
  const gardes = [];
  for (const r of depots) {
    if (r.worktreeOf && !inclureWorktrees && r.abs !== racine) {
      const principal = normaliser(r.worktreeOf);
      if (principaux.has(principal)) { ignores.push({ path: r.path, reason: `worktree de ${cheminRelatif(racine, r.worktreeOf)}` }); continue; }
      if (principauxVus.has(principal)) { ignores.push({ path: r.path, reason: `autre worktree de ${r.worktreeOf}` }); continue; }
      principauxVus.add(principal);
    }
    gardes.push(r);
  }
  return { repos: gardes, loose: isoles, skipped: ignores };
}

// ---------- divers ----------

export function lireJsonSouple(fichier) {
  try {
    const texte = fs.readFileSync(fichier, 'utf8')
      .replace(/^﻿/, '')
      .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, chaine) => chaine ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

export function lireArguments(argv, defauts = {}) {
  const sortie = { _: [], ...defauts };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) sortie[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) sortie[k] = argv[++i];
      else sortie[k] = true;
    } else sortie._.push(a);
  }
  return sortie;
}

// les icônes qu'on peut donner à un bloc (champ icon), dessinées dans assets/carte/js/01-base.js
export const ICONES = ['appareil-photo', 'argent', 'boite', 'bouclier', 'cadeau', 'cadenas', 'calendrier', 'camion', 'carte-bancaire', 'cloche', 'code-barres', 'coeur', 'couches', 'courriel', 'document', 'donnees', 'dossier', 'eclair', 'ecran', 'etincelle', 'etiquette', 'etoile', 'fiole', 'globe', 'graphique', 'groupe', 'horloge', 'image', 'lien', 'lieu', 'liste', 'livre', 'loupe', 'magasin', 'maison', 'message', 'nuage', 'ordinateur', 'outils', 'palette', 'panier', 'personne', 'puce', 'reglages', 'robot', 'serveur', 'synchronisation', 'telechargement', 'telephone', 'terminal', 'ticket'];

export const formaterNombre = (n) => n >= 10000 ? (n / 1000).toFixed(0) + ' k' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + ' k' : String(n);
