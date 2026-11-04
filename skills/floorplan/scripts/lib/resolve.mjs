// Résout les imports vers des fichiers du code, ou vers des paquets extérieurs nommés.
import fs from 'node:fs';
import path from 'node:path';
import { lireJsonSouple } from './common.mjs';

const P = path.posix;

const MODULES_NODE = new Set(['assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib', 'test']);
const STDLIB_PYTHON = new Set('__future__ abc argparse array ast asyncio atexit base64 bisect builtins bz2 calendar cgi cmath codecs collections colorsys concurrent configparser contextlib contextvars copy csv ctypes curses dataclasses datetime decimal difflib dis email encodings enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc getopt getpass gettext glob graphlib gzip hashlib heapq hmac html http imaplib importlib inspect io ipaddress itertools json keyword linecache locale logging lzma mailbox math mimetypes mmap multiprocessing netrc numbers operator optparse os pathlib pdb pickle pkgutil platform plistlib poplib posixpath pprint profile pstats pty queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtplib socket socketserver sqlite3 ssl stat statistics string stringprep struct subprocess sys sysconfig syslog tarfile tempfile termios textwrap threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle types typing typing_extensions unicodedata unittest urllib uuid venv warnings wave weakref webbrowser winreg wsgiref xml xmlrpc zipfile zipimport zlib zoneinfo'.split(' '));
const STD_RUST = new Set(['std', 'core', 'alloc', 'crate', 'self', 'super']);

const EXT_JS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.d.ts', '.json'];

export function creerResolveur(racine, fichiers) {
  const ensembleFichiers = new Set(fichiers.map((f) => f.path));
  const parChemin = new Map(fichiers.map((f) => [f.path, f]));
  const dossiersAvec = (nom) => fichiers.filter((f) => P.basename(f.path) === nom).map((f) => P.dirname(f.path));

  // ---- JS : chemins de tsconfig/jsconfig + paquets de l'espace de travail ----
  const cacheTsconfig = new Map();
  const chargerTsconfig = (fichier) => {
    if (cacheTsconfig.has(fichier)) return cacheTsconfig.get(fichier);
    let config = null;
    const json = lireJsonSouple(path.join(racine, fichier));
    if (json) {
      const dossier = P.dirname(fichier);
      let options = json.compilerOptions || {};
      let dossierOptions = dossier;
      if ((!options.paths && !options.baseUrl) && typeof json.extends === 'string' && json.extends.startsWith('.')) {
        const fichierParent = P.normalize(P.join(dossier, json.extends.endsWith('.json') ? json.extends : json.extends + '.json'));
        const base = ensembleFichiers.has(fichierParent) ? chargerTsconfig(fichierParent) : null;
        if (base) { options = base.raw; dossierOptions = base.optsDir; }
      }
      const dossierBase = options.baseUrl ? P.normalize(P.join(dossierOptions, options.baseUrl)) : dossierOptions;
      config = { raw: options, optsDir: dossierOptions, baseDir: dossierBase, hasBaseUrl: !!options.baseUrl, paths: Object.entries(options.paths || {}) };
    }
    cacheTsconfig.set(fichier, config);
    return config;
  };
  const cacheProche = new Map();
  const tsconfigProche = (dossier) => {
    if (cacheProche.has(dossier)) return cacheProche.get(dossier);
    let trouve = null;
    for (const nom of ['tsconfig.json', 'jsconfig.json']) {
      const f = dossier === '.' ? nom : `${dossier}/${nom}`;
      if (ensembleFichiers.has(f)) { trouve = chargerTsconfig(f); if (trouve) break; }
    }
    if (!trouve && dossier !== '.' && dossier !== '') trouve = tsconfigProche(P.dirname(dossier));
    cacheProche.set(dossier, trouve);
    return trouve;
  };
  const paquetsEspace = new Map();
  for (const dossier of dossiersAvec('package.json')) {
    const paquetJson = lireJsonSouple(path.join(racine, dossier, 'package.json'));
    if (paquetJson?.name) paquetsEspace.set(paquetJson.name, { dir: dossier, pj: paquetJson });
  }

  const essayerFichierJs = (p) => {
    p = P.normalize(p);
    if (ensembleFichiers.has(p) && !p.endsWith('/')) return p;
    for (const ext of EXT_JS) if (ensembleFichiers.has(p + ext)) return p + ext;
    const sansExtJs = p.replace(/\.(m|c)?jsx?$/, '');
    if (sansExtJs !== p) for (const ext of ['.ts', '.tsx', '.mts', '.cts']) if (ensembleFichiers.has(sansExtJs + ext)) return sansExtJs + ext;
    for (const ext of EXT_JS) if (ensembleFichiers.has(`${p}/index${ext}`)) return `${p}/index${ext}`;
    return null;
  };

  const resoudreJs = (depuis, specifieur) => {
    if (specifieur.startsWith('.')) {
      const candidat = essayerFichierJs(P.join(P.dirname(depuis), specifieur));
      return candidat ? { file: candidat } : { unresolved: true };
    }
    const config = tsconfigProche(P.dirname(depuis));
    if (config) {
      for (const [motif, cibles] of config.paths) {
        const etoile = motif.indexOf('*');
        const correspondance = etoile === -1 ? (specifieur === motif ? '' : null)
          : (specifieur.startsWith(motif.slice(0, etoile)) && specifieur.endsWith(motif.slice(etoile + 1)) ? specifieur.slice(etoile, specifieur.length - (motif.length - etoile - 1)) : null);
        if (correspondance === null) continue;
        for (const t of cibles) {
          const candidat = essayerFichierJs(P.join(config.baseDir, t.split('*').join(correspondance)));
          if (candidat) return { file: candidat };
        }
      }
      if (config.hasBaseUrl) { const candidat = essayerFichierJs(P.join(config.baseDir, specifieur)); if (candidat) return { file: candidat }; }
    }
    if (specifieur.startsWith('node:')) return { builtin: true };
    const morceaux = specifieur.split('/');
    const nomPaquet = specifieur.startsWith('@') ? morceaux.slice(0, 2).join('/') : morceaux[0];
    const sousChemin = morceaux.slice(specifieur.startsWith('@') ? 2 : 1).join('/');
    const espace = paquetsEspace.get(nomPaquet);
    if (espace) {
      if (sousChemin) { const candidat = essayerFichierJs(P.join(espace.dir, sousChemin)) || essayerFichierJs(P.join(espace.dir, 'src', sousChemin)); if (candidat) return { file: candidat }; }
      const exportsPaquet = espace.pj.exports;
      const entrees = [espace.pj.source, typeof exportsPaquet === 'string' ? exportsPaquet : exportsPaquet?.['.']?.import || exportsPaquet?.['.']?.default || (typeof exportsPaquet?.['.'] === 'string' ? exportsPaquet['.'] : null), espace.pj.module, espace.pj.main, 'src/index', 'index'];
      for (const e of entrees) { if (typeof e !== 'string') continue; const candidat = essayerFichierJs(P.join(espace.dir, e)); if (candidat) return { file: candidat }; }
    }
    if (MODULES_NODE.has(nomPaquet)) return { builtin: true };
    if (/^[@a-z0-9]/i.test(nomPaquet)) return { external: nomPaquet, eco: 'npm' };
    return { unresolved: true };
  };

  // ---- Python ----
  const cacheRacinesPy = new Map();
  const racinesPyPour = (depuis, cheminDepot) => {
    const dossier = P.dirname(depuis);
    const cle = dossier + '|' + cheminDepot;
    if (cacheRacinesPy.has(cle)) return cacheRacinesPy.get(cle);
    const racines = [];
    const racineDepot = cheminDepot === '.' ? '' : cheminDepot;
    let d = dossier;
    while (true) {
      racines.push(d === '.' ? '' : d);
      if (d === racineDepot || d === '.' || d === '') break;
      d = P.dirname(d);
    }
    racines.push(racineDepot ? racineDepot + '/src' : 'src');
    cacheRacinesPy.set(cle, racines);
    return racines;
  };
  const essayerModulePy = (base) => {
    const b = base.replace(/^\/+/, '');
    if (ensembleFichiers.has(b + '.py')) return b + '.py';
    if (ensembleFichiers.has(b + '/__init__.py')) return b + '/__init__.py';
    if (ensembleFichiers.has(b + '.pyi')) return b + '.pyi';
    return null;
  };
  const resoudrePy = (depuis, importe, cheminDepot) => {
    const specifieur = importe.spec;
    const cibles = [];
    if (specifieur.startsWith('.')) {
      const points = specifieur.match(/^\.+/)[0].length;
      let base = P.dirname(depuis);
      for (let i = 1; i < points; i++) base = P.dirname(base);
      const reste = specifieur.slice(points).replace(/\./g, '/');
      const baseModule = reste ? P.join(base, reste) : base;
      const modulePy = reste ? essayerModulePy(baseModule) : null;
      const sousModules = (importe.names || []).map((n) => essayerModulePy(P.join(baseModule, n))).filter(Boolean);
      if (sousModules.length) return { files: sousModules, names: importe.names, module: modulePy };
      if (modulePy) return { file: modulePy };
      if (!reste) { const initial = essayerModulePy(base); if (initial) return { file: initial }; }
      return { unresolved: true };
    }
    const premier = specifieur.split('.')[0];
    const cheminModule = specifieur.replace(/\./g, '/');
    for (const r of racinesPyPour(depuis, cheminDepot)) {
      const base = r ? `${r}/${cheminModule}` : cheminModule;
      if (importe.from && importe.names?.length) {
        const sousModules = importe.names.map((n) => essayerModulePy(`${base}/${n}`)).filter(Boolean);
        if (sousModules.length) return { files: sousModules, names: importe.names, module: essayerModulePy(base) };
      }
      const candidat = essayerModulePy(base);
      if (candidat) return { file: candidat };
      // `import a.b.c` alors que seul a/b existe
      const morceaux = cheminModule.split('/');
      for (let k = morceaux.length - 1; k >= 1; k--) {
        const h = essayerModulePy((r ? r + '/' : '') + morceaux.slice(0, k).join('/'));
        if (h && cibles.length === 0) { cibles.push(h); break; }
      }
      if (cibles.length) return { file: cibles[0] };
    }
    if (STDLIB_PYTHON.has(premier)) return { builtin: true };
    return { external: premier, eco: 'pypi' };
  };

  // ---- Go ----
  const modulesGo = dossiersAvec('go.mod').map((dossier) => {
    const texte = fs.readFileSync(path.join(racine, dossier, 'go.mod'), 'utf8');
    return { dir: dossier, module: /^module\s+(\S+)/m.exec(texte)?.[1] };
  }).filter((m) => m.module).sort((a, b) => b.module.length - a.module.length);
  const fichiersGoParDossier = new Map();
  for (const f of fichiers) if (f.path.endsWith('.go') && !f.path.endsWith('_test.go')) {
    const d = P.dirname(f.path);
    if (!fichiersGoParDossier.has(d)) fichiersGoParDossier.set(d, []);
    fichiersGoParDossier.get(d).push(f.path);
  }
  const resoudreGo = (depuis, specifieur) => {
    for (const m of modulesGo) {
      if (specifieur === m.module || specifieur.startsWith(m.module + '/')) {
        const dossier = P.normalize(P.join(m.dir, specifieur.slice(m.module.length)));
        const liste = fichiersGoParDossier.get(dossier === '' ? '.' : dossier);
        if (liste?.length) {
          const prefere = liste.find((p) => P.basename(p, '.go') === P.basename(dossier)) || liste.sort()[0];
          return { file: prefere };
        }
        return { unresolved: true };
      }
    }
    if (!specifieur.split('/')[0].includes('.')) return { builtin: true };
    return { external: specifieur.split('/').slice(0, 3).join('/'), eco: 'go' };
  };

  // ---- Rust ----
  const racinesCrates = dossiersAvec('Cargo.toml').map((d) => (d === '.' ? 'src' : `${d}/src`)).sort((a, b) => b.length - a.length);
  const resoudreRust = (depuis, importe) => {
    const dossier = P.dirname(depuis);
    const radical = P.basename(depuis, '.rs');
    if (importe.kind === 'mod') {
      const base = ['mod', 'lib', 'main'].includes(radical) ? dossier : `${dossier}/${radical}`;
      for (const c of [`${base}/${importe.spec}.rs`, `${base}/${importe.spec}/mod.rs`]) if (ensembleFichiers.has(c)) return { file: c };
      return { unresolved: true };
    }
    const segments = importe.spec.split('::');
    if (segments[0] === 'crate') {
      const racineCrate = racinesCrates.find((r) => depuis.startsWith(r + '/'));
      if (!racineCrate) return { unresolved: true };
      const reste = segments.slice(1);
      for (let k = reste.length; k >= 1; k--) {
        const b = `${racineCrate}/${reste.slice(0, k).join('/')}`;
        for (const c of [b + '.rs', b + '/mod.rs']) if (ensembleFichiers.has(c)) return { file: c };
      }
      return { unresolved: true };
    }
    if (STD_RUST.has(segments[0])) return { builtin: true };
    return { external: segments[0], eco: 'cargo' };
  };

  // ---- JVM ----
  const indexJvm = new Map();
  for (const f of fichiers) if (f.pkg) indexJvm.set(`${f.pkg}.${P.basename(f.path).replace(/\.\w+$/, '')}`, f.path);
  const resoudreJvm = (depuis, specifieur) => {
    if (indexJvm.has(specifieur)) return { file: indexJvm.get(specifieur) };
    if (/^(java|javax|kotlin|scala|jdk|sun)\./.test(specifieur)) return { builtin: true };
    const morceaux = specifieur.split('.');
    for (let k = morceaux.length - 1; k >= 2; k--) if (indexJvm.has(morceaux.slice(0, k).join('.'))) return { file: indexJvm.get(morceaux.slice(0, k).join('.')) };
    return { external: morceaux.slice(0, Math.min(3, morceaux.length - 1)).join('.'), eco: 'maven' };
  };

  // ---- chemins relatifs génériques (C, Ruby, PHP, CSS) ----
  const parNomDeBase = new Map();
  for (const f of fichiers) { const b = P.basename(f.path); parNomDeBase.set(b, parNomDeBase.has(b) ? null : f.path); }
  const resoudreRelatif = (depuis, specifieur, extensions) => {
    const base = P.normalize(P.join(P.dirname(depuis), specifieur));
    for (const e of ['', ...extensions]) if (ensembleFichiers.has(base + e)) return { file: base + e };
    const unique = parNomDeBase.get(P.basename(specifieur));
    if (unique) return { file: unique };
    return { unresolved: true };
  };

  return function resoudre(fichier, importe) {
    const langage = fichier.lang;
    switch (langage) {
      case 'typescript': case 'javascript': case 'vue': case 'svelte': case 'astro': return resoudreJs(fichier.path, importe.spec);
      case 'python': return resoudrePy(fichier.path, importe, fichier.repo);
      case 'go': return resoudreGo(fichier.path, importe.spec);
      case 'rust': return resoudreRust(fichier.path, importe);
      case 'java': case 'kotlin': case 'scala': case 'groovy': return resoudreJvm(fichier.path, importe.spec);
      case 'ruby': return resoudreRelatif(fichier.path, importe.spec, ['.rb']);
      case 'php': return resoudreRelatif(fichier.path, importe.spec, ['.php']);
      case 'css': return resoudreRelatif(fichier.path, importe.spec, ['.css', '.scss', '.sass', '.less']).file ? resoudreRelatif(fichier.path, importe.spec, ['.css', '.scss']) : resoudreRelatif(fichier.path, P.join(P.dirname(importe.spec), '_' + P.basename(importe.spec)), ['.scss', '.sass']);
      default: return resoudreRelatif(fichier.path, importe.spec, []);
    }
  };
}
