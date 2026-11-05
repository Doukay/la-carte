// Un détecteur de ce que le plugin peut faire sur l’ordinateur de quelqu’un. docs/est-ce-sur.md promet : aucun hook, aucun
// serveur MCP, aucune dépendance ni étape d’installation, rien de téléchargé ni lancé depuis internet, aucun appel
// vers l’extérieur, une liste fixe de programmes lancés, et des fichiers embarqués identiques à leurs
// versions publiées. Ces tests échouent si l’un de ces points change, pour qu’un changement pareil ne passe pas inaperçu,
// dans une pull request ou ailleurs. Si le changement est voulu, mets à jour ce fichier et docs/est-ce-sur.md ensemble.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEPOT, DOSSIER_SKILL, lib } from './aides.mjs';

const { assemblerPage } = await lib('page.mjs');

/** Chemins relatifs de chaque fichier sous dir, avec des barres obliques, sans le dossier de git ni les installations. */
const tousLesFichiers = (dossier) => fs.readdirSync(dossier, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => path.relative(dossier, path.join(e.parentPath ?? e.path, e.name)).replace(/\\/g, '/'))
  .filter((f) => !/^(\.git|node_modules)\//.test(f));
const MISE_A_JOUR = 'Si c’est voulu, mets à jour tests/chaine-securite.test.mjs et docs/est-ce-sur.md ensemble.';
const cheminRelatif = (f) => path.relative(DOSSIER_SKILL, f).replace(/\\/g, '/');
const lire = (f) => fs.readFileSync(f, 'utf8');
const json = (p) => JSON.parse(lire(path.join(DEPOT, p)));
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const livres = tousLesFichiers(DOSSIER_SKILL).map((f) => path.join(DOSSIER_SKILL, f));
const estEmbarque = (f) => cheminRelatif(f).startsWith('assets/vendor/');
// le code qui s’exécute : les scripts, le serveur de la carte, la page et ses ajouts (pas le moteur de disposition embarqué)
const code = livres.filter((f) => /\.(mjs|js|html)$/.test(f) && !estEmbarque(f));
/** Chaque occurrence de `re` dans le code livré, sous la forme { file, text, line }, sans les lignes de commentaire. */
function trouver(motif) {
  const sortie = [];
  for (const f of code) {
    lire(f).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      for (const m of line.matchAll(new RegExp(motif, 'g'))) sortie.push({ file: cheminRelatif(f), text: m[0], line: i + 1, m });
    });
  }
  return sortie;
}

test('le plugin n’est qu’un skill : ni hooks, ni serveurs MCP, ni commandes qui se lancent toutes seules', () => {
  // .claude/ contient les réglages locaux du mainteneur, ignorés par git
  const tous = tousLesFichiers(DEPOT).filter((f) => !f.startsWith('.claude/'));
  assert.deepEqual(tous.filter((f) => /(^|\/)(hooks\.json|\.mcp\.json|\.lsp\.json)$/.test(f) || /(^|\/)hooks\//.test(f)), [], `ni hooks ni serveurs MCP/LSP. ${MISE_A_JOUR}`);
  // documentationUrl, privacyPolicyUrl et supportUrl ne sont que des liens, affichés dans la fiche de l’annuaire des plugins Claude
  assert.deepEqual(Object.keys(json('.claude-plugin/plugin.json')).sort(), ['author', 'description', 'documentationUrl', 'homepage', 'keywords', 'license', 'name', 'privacyPolicyUrl', 'repository', 'supportUrl', 'version'], `Manifeste Claude Code : rien en dehors du skill. ${MISE_A_JOUR}`);
  assert.deepEqual(Object.keys(json('.codex-plugin/plugin.json')).sort(), ['author', 'description', 'homepage', 'interface', 'keywords', 'license', 'name', 'repository', 'requires_local_executor', 'skills', 'version'], `Manifeste Codex : rien en dehors du skill. ${MISE_A_JOUR}`);
  assert.equal(json('.codex-plugin/plugin.json').skills, './skills/');
  // les deux places de marché installent depuis ce dépôt lui-même, jamais depuis ailleurs
  assert.deepEqual(json('.claude-plugin/marketplace.json').plugins.map((p) => p.source), ['./']);
  for (const p of json('.agents/plugins/marketplace.json').plugins) assert.equal(typeof p.source === 'string' ? p.source : p.source?.path, './', `Source de la place de marché Codex. ${MISE_A_JOUR}`);
});

test('rien à installer : aucune dépendance et aucun script d’installation', () => {
  const paquet = json('package.json');
  for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) assert.equal(paquet[k], undefined, `package.json ${k}. ${MISE_A_JOUR}`);
  assert.deepEqual(paquet.scripts, { test: 'node --test' }, `package.json scripts : seulement les tests. ${MISE_A_JOUR}`);
  assert.ok(!tousLesFichiers(DEPOT).some((f) => /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f)), 'aucun fichier de verrouillage, car rien n’est installé');
});

test('les seules commandes pré-approuvées sont les scripts du skill lui-même, et cette liste est fixe', () => {
  const entete = /^---\n([\s\S]*?)\n---/.exec(lire(path.join(DOSSIER_SKILL, 'SKILL.md')).replace(/\r\n/g, '\n'))[1];
  // chaque script se lance sans demande pendant que le skill sert, donc en ajouter un est un changement voulu
  const SCRIPTS = ['actualiser.mjs', 'analyser.mjs', 'construire.mjs', 'decrire.mjs', 'etat.mjs', 'ouvrir.mjs', 'plan.mjs', 'recents.mjs'];
  const accordes = /^allowed-tools:\n((?: {2}- .*\n?)+)/m.exec(entete + '\n')?.[1].trim().split('\n').map((l) => l.replace(/^\s*- /, '').trim());
  assert.deepEqual(accordes, SCRIPTS.map((s) => `Bash(node \${CLAUDE_SKILL_DIR}/scripts/${s} *)`), `SKILL.md allowed-tools : exactement les scripts du skill. ${MISE_A_JOUR}`);
  const scripts = fs.readdirSync(path.join(DOSSIER_SKILL, 'scripts')).filter((n) => !fs.statSync(path.join(DOSSIER_SKILL, 'scripts', n)).isDirectory()).sort();
  assert.deepEqual(scripts, SCRIPTS, `liste de scripts/. ${MISE_A_JOUR}`);
});

test('aucun envoi vers l’extérieur : il ne contacte jamais internet', () => {
  // aucun module réseau, sauf le serveur local de la carte
  const importsReseau = trouver(/from\s+['"](?:node:)?(https?|http2|net|tls|dgram|dns|undici)['"]|require\(\s*['"](?:node:)?(https?|http2|net|tls|dgram|dns|undici)['"]\s*\)/);
  assert.deepEqual(importsReseau.map((x) => `${x.file}: ${x.text}`), [`assets/serveur.mjs: from 'node:http'`], `modules réseau. ${MISE_A_JOUR}`);
  // le serveur n’écoute que sur cet ordinateur
  assert.match(lire(path.join(DOSSIER_SKILL, 'assets', 'serveur.mjs')), /serveur\.listen\(port, '127\.0\.0\.1'\);/);
  assert.doesNotMatch(lire(path.join(DOSSIER_SKILL, 'assets', 'serveur.mjs')), /\.listen\([^)]*(0\.0\.0\.0|::)/);

  // chaque appel : vers le serveur de la carte lui-même
  const LOCAL = /^(['"`]\/|s\.url \+)/;
  const appels = trouver(/\bfetch\(\s*([^,)]+)/).map((x) => ({ ...x, arg: x.m[1].trim() }));
  const dehors = appels.filter((c) => !LOCAL.test(c.arg));
  assert.deepEqual(dehors.map((c) => `${c.file}: fetch(${c.arg}`), [], `appels qui sortent de cet ordinateur. ${MISE_A_JOUR}`);
  assert.deepEqual(trouver(/\b(WebSocket|XMLHttpRequest|sendBeacon|importScripts)\b/).map((x) => `${x.file}: ${x.text}`), [], `autres moyens de joindre un serveur. ${MISE_A_JOUR}`);
  assert.deepEqual(trouver(/new EventSource\(\s*(?!['"`]\/)/).map((x) => `${x.file}:${x.line}`), [], 'rechargement en direct seulement depuis le serveur local');

  // la page de la carte ne charge rien depuis internet : le moteur de disposition et les polices sont intégrés
  const page = assemblerPage(DOSSIER_SKILL);
  assert.doesNotMatch(page, /<script[^>]*\ssrc=/i, 'aucun script extérieur');
  assert.doesNotMatch(page, /<link[^>]*href=["']https?:/i, 'aucune feuille de style ni police extérieure');
  assert.doesNotMatch(page, /url\(\s*["']?https?:/i, 'aucune image ni police extérieure dans le CSS');
});

test('il lance une liste fixe de programmes, et jamais par un shell', () => {
  const importateurs = trouver(/from\s+['"](?:node:)?child_process['"]/).map((x) => x.file).sort();
  assert.deepEqual(importateurs, ['assets/serveur.mjs', 'scripts/actualiser.mjs', 'scripts/lib/commun.mjs', 'scripts/ouvrir.mjs'], `fichiers qui lancent des programmes. ${MISE_A_JOUR}`);
  // seulement spawn et execFileSync, qui prennent un programme et ses arguments (le .exec() d’une regex sert à lire du texte)
  const noms = trouver(/import\s*\{([^}]*)\}\s*from\s+['"](?:node:)?child_process['"]/).flatMap((x) => x.m[1].split(',').map((n) => n.trim()));
  assert.deepEqual([...new Set(noms)].sort(), ['execFileSync', 'spawn'], `fonctions de child_process utilisées. ${MISE_A_JOUR}`);
  assert.deepEqual(trouver(/(?<![.\w])(exec|execSync|fork|spawnSync|execFile)\(/).map((x) => `${x.file}:${x.line} ${x.text}`), [], `autres moyens de lancer des programmes. ${MISE_A_JOUR}`);
  assert.deepEqual(trouver(/shell:\s*true/).map((x) => `${x.file}:${x.line}`), [], 'jamais par un shell');
  // ce que lance chaque appel : where/which, la CLI Claude Code ou Codex, Node qui exécute les scripts du skill,
  // git, et la commande du système « ouvrir cette adresse dans le navigateur »
  const AUTORISES = new Set([
    "process.platform === 'win32' ? 'where' : 'which'",
    'cli.cmd',
    'process.execPath',
    'executableNode',
    "'git'",
    'ouvreur[0]',
    'commande',
  ]);
  const lancements = trouver(/\b(spawn|execFileSync)\(\s*([^,]+),/).map((x) => ({ ...x, prog: x.m[2].trim() }));
  assert.ok(lancements.length >= 8, 'les appels sont trouvés');
  assert.deepEqual(lancements.filter((s) => !AUTORISES.has(s.prog)).map((s) => `${s.file}:${s.line} ${s.prog}`), [], `programmes lancés. ${MISE_A_JOUR}`);
  assert.match(lire(path.join(DOSSIER_SKILL, 'scripts', 'actualiser.mjs')), /const executableNode = process\.execPath;/);
  // les commandes qui ouvrent le navigateur n’ouvrent que l’adresse locale de la carte
  const ouvreurs = /\? \['cmd', \['\/c', 'start', '', u\]\] : process\.platform === 'darwin' \? \['open', \[u\]\] : \['xdg-open', \[u\]\]/;
  assert.match(lire(path.join(DOSSIER_SKILL, 'assets', 'serveur.mjs')), ouvreurs);
  assert.match(lire(path.join(DOSSIER_SKILL, 'scripts', 'ouvrir.mjs')), ouvreurs);
});

test('aucun code n’est téléchargé, décodé ni construit à partir de texte pendant l’exécution', () => {
  assert.deepEqual(trouver(/(?<![.\w])eval\(/).map((x) => `${x.file}:${x.line}`), [], `eval. ${MISE_A_JOUR}`);
  // l’unique exception : serveur.mjs charge le code de recherche de la carte depuis la-carte/requete.mjs, un fichier écrit par la construction
  assert.deepEqual(trouver(/new Function\(/).map((x) => x.file), ['assets/serveur.mjs'], `new Function. ${MISE_A_JOUR}`);
  assert.match(lire(path.join(DOSSIER_SKILL, 'assets', 'serveur.mjs')), /const sourceNoyau = fs\.readFileSync\(path\.join\(ici, 'requete\.mjs'\), 'utf8'\)/);
  assert.deepEqual(trouver(/\bimport\s*\(/).map((x) => `${x.file}:${x.line}`), [], `import dynamique. ${MISE_A_JOUR}`);
  assert.deepEqual(trouver(/from\s+['"](?:node:)?(vm|worker_threads|inspector|wasi)['"]|new Worker\(|WebAssembly\./).map((x) => `${x.file}: ${x.text}`), [], `autres moyens d’exécuter du code. ${MISE_A_JOUR}`);
  // décodage base64 : seulement Santé qui lit le milieu d’un jeton trouvé, pour savoir de quel genre de jeton il s’agit
  assert.deepEqual(trouver(/\batob\(|['"]base64['"]\s*\)/).filter((x) => x.file !== 'scripts/construire.mjs').map((x) => x.file), ['scripts/lib/sante.mjs'], `décodage base64. ${MISE_A_JOUR}`);
  // aucune longue chaîne opaque qui pourrait cacher une charge (la construction intègre le logo et les polices depuis des fichiers)
  assert.deepEqual(trouver(/[A-Za-z0-9+/=]{160,}/).map((x) => `${x.file}:${x.line}`), [], 'longues chaînes encodées');
});

test('chaque fichier livré est du code source, du texte ou un genre connu d’image ou de police', () => {
  const genres = new Set(livres.map((f) => path.extname(f).toLowerCase()));
  assert.deepEqual([...genres].sort(), ['.css', '.html', '.js', '.json', '.md', '.mjs', '.png', '.txt', '.woff2', '.yaml'].filter((k) => genres.has(k)), 'genres de fichier');
  for (const k of genres) assert.ok(['.css', '.html', '.js', '.json', '.md', '.mjs', '.png', '.txt', '.woff2', '.yaml'].includes(k), `genre de fichier inattendu : ${k}. ${MISE_A_JOUR}`);
});

test('les fichiers embarqués sont inchangés : le moteur de disposition est identique, octet pour octet, à elkjs 0.9.3 sur npm', () => {
  const EMBARQUES = {
    // npm: elkjs@0.9.3, package/lib/elk.bundled.js
    'elk.bundled.js': 'b0745abd7f23cd91690a1587e377edbe19fd7233c783300290936720546216d4',
    'elkjs-LICENSE.md': null,
    'fonts/inter-LICENSE.txt': null,
    'fonts/inter-latin-ext-wght-normal.woff2': null,
    'fonts/inter-latin-wght-normal.woff2': null,
    'fonts/jetbrains-mono-LICENSE.txt': null,
    'fonts/jetbrains-mono-latin-ext-wght-normal.woff2': null,
    'fonts/jetbrains-mono-latin-wght-normal.woff2': null,
  };
  const dossier = path.join(DOSSIER_SKILL, 'assets', 'vendor');
  assert.deepEqual(tousLesFichiers(dossier).sort(), Object.keys(EMBARQUES).sort(), `fichiers embarqués. ${MISE_A_JOUR}`);
  assert.equal(sha256(path.join(dossier, 'elk.bundled.js')), EMBARQUES['elk.bundled.js'], `elk.bundled.js a changé. ${MISE_A_JOUR}`);
});

test('les sommes de contrôle distinguent la copie exacte d’une version publiée d’une copie modifiée', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const temporaire = fs.mkdtempSync(path.join(os.tmpdir(), 'la-carte-checksums-'));
  // empreintes de cette copie de travail (EMPREINTES.txt est celui de la dernière version publiée, on n’y touche pas)
  const liste = path.join(temporaire, 'list.txt'), copie = path.join(temporaire, 'copy');
  const outil = (...params) => execFileSync(process.execPath, [path.join(DEPOT, 'outils', 'empreintes.mjs'), ...params, '--list', liste], { encoding: 'utf8' });
  const lancer = (dossier) => { try { return { ok: true, out: outil('--check', dossier) }; } catch (e) { return { ok: false, out: String(e.stdout) }; } };
  try {
    outil();
    // une copie exacte de chaque fichier de la liste
    const listes = lire(liste).split('\n').filter((l) => /^[0-9a-f]{64}  /.test(l)).map((l) => l.slice(66));
    for (const f of listes) { fs.mkdirSync(path.dirname(path.join(copie, f)), { recursive: true }); fs.copyFileSync(path.join(DEPOT, f), path.join(copie, f)); }
    const identique = lancer(copie);
    assert.ok(identique.ok, identique.out);
    assert.match(identique.out, /les \d+ fichiers sont identiques/);
    fs.appendFileSync(path.join(copie, 'skills', 'la-carte', 'scripts', 'construire.mjs'), '\n// changed\n');
    fs.writeFileSync(path.join(copie, 'skills', 'la-carte', 'scripts', 'extra.mjs'), '');
    const difference = lancer(copie);
    assert.equal(difference.ok, false);
    assert.match(difference.out, /Modifiés :\n {2}skills\/la-carte\/scripts\/construire\.mjs/);
    assert.match(difference.out, /Absents de la version :\n {2}skills\/la-carte\/scripts\/extra\.mjs/);
  } finally { fs.rmSync(temporaire, { recursive: true, force: true }); }
});
