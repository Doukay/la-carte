#!/usr/bin/env node
// floorplan/serveur.mjs : sert cette carte en local et répond aux questions sur le code par la
// CLI Claude Code ou par Codex. Généré par construire.mjs ; n’a besoin que de Node 18+ et d’un `claude` ou d’un `codex` connecté.
//
// usage : node floorplan/serveur.mjs [--port 4378] [--engine claude|codex] [--model <modèle>] [--claude <chemin>] [--codex <chemin>]
//                                 [--no-open] [--idle-exit <minutes>]
//        node floorplan/serveur.mjs --stop
//        node floorplan/serveur.mjs --export [<fichier>] [--include flows,notes,recent,health]   (une copie à partager ; par défaut flows,notes)
//
// Le serveur n’écoute que sur 127.0.0.1. Chaque question s’exécute à la racine du code, avec ton propre compte :
// `claude -p` avec des outils en lecture seule (Read, Grep, Glob, et Bash limité à floorplan/requete.mjs), ou
// `codex exec` dans son bac à sable en lecture seule. Il utilise celui qui a construit la carte, sinon celui qui est installé.
// Quand la carte est reconstruite, les onglets ouverts se rechargent sur place. Le serveur en cours est noté dans .cache/server.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '..');
const argv = process.argv.slice(2);
const option = (nom, parDefaut) => { const i = argv.indexOf('--' + nom); return i < 0 ? parDefaut : argv[i + 1]; };
const aOption = (nom) => argv.includes('--' + nom);
const fichierEtat = path.join(ici, '.cache', 'server.json');
const lireEtat = () => { try { return JSON.parse(fs.readFileSync(fichierEtat, 'utf8')); } catch { return null; } };
if (aOption('stop')) {
  const s = lireEtat();
  let arrete = false;
  if (s?.pid) { try { process.kill(s.pid); arrete = true; } catch {} }
  try { fs.unlinkSync(fichierEtat); } catch {}
  console.log(arrete ? `Serveur de la carte arrêté (${s.url}).` : 'Le serveur de la carte ne tournait pas.');
  process.exit(0);
}

// Problèmes de santé marqués « Pas un problème » sur la carte ; construire.mjs les range dans graphe.json
const fichierRejets = path.join(ici, 'rejets-sante.json');
const lireRejets = () => { try { const { dismissed: rejetes } = JSON.parse(fs.readFileSync(fichierRejets, 'utf8')); return Array.isArray(rejetes) ? rejetes : []; } catch { return []; } };
const nettoyerRejet = (d) => ({
  id: String(d.id).slice(0, 2000),
  locations: (Array.isArray(d.locations) ? d.locations : []).slice(0, 500).map((l) => String(l).slice(0, 1000)),
  ...(d.severity ? { severity: String(d.severity).slice(0, 20) } : {}),
  ...(d.reason ? { reason: String(d.reason).slice(0, 1000) } : {}),
  at: new Date().toISOString(),
});

// ---------- export : une copie de la carte à partager ----------
// La même page autonome, marquée comme exportée : pas de bulle de questions, aucune demande à Claude ou Codex, aucun lien vers
// cet ordinateur, et seulement les options demandées. Utilisé par le bouton Exporter de la carte et par --export.
const EXPORT_PARTIES = ['flows', 'notes', 'recent', 'health'];
const EXPORT_PAR_DEFAUT = ['flows', 'notes'];
const DEBUT_DONNEES = '<script>window.FLOORPLAN = ';
function exporterCarte(inclus, parcoursSupplementaires = []) {
  const html = fs.readFileSync(path.join(ici, 'index.html'), 'utf8');
  const a = html.indexOf(DEBUT_DONNEES), b = html.indexOf(';</script>', a);
  if (a < 0 || b < 0) throw Object.assign(new Error('Cette carte est trop ancienne pour être exportée. Demande à Claude ou à Codex de mettre d’abord le floorplan à jour.'), { plain: true });
  const g = JSON.parse(html.slice(a + DEBUT_DONNEES.length, b));
  const retenues = EXPORT_PARTIES.filter((p) => inclus.includes(p));
  const sortie = {
    ...g,
    // l’adresse distante peut contenir un jeton de connexion ; le chemin du dossier est celui de cet ordinateur
    meta: { ...g.meta, root: null, repos: (g.meta.repos || []).map(({ remote: distant, ...r }) => r), exported: { at: new Date().toISOString(), include: retenues } },
    parcours: retenues.includes('flows') ? [...g.parcours, ...parcoursSupplementaires.filter((f) => !g.parcours.some((x) => x.id === f.id))] : [],
    visite: retenues.includes('flows') ? g.visite : [],
    files: retenues.includes('notes') ? g.files : g.files.map(({ note, ...f }) => f),
  };
  if (!retenues.includes('recent')) delete sortie.recent;
  if (!retenues.includes('health')) delete sortie.sante;
  // les rejets faits depuis la dernière construction voyagent avec la copie (la page les applique ; sans les raisons, qui sont des notes personnelles)
  else if (sortie.sante) { const liste = lireRejets().map(({ reason: raison, ...d }) => d); if (liste.length) sortie.sante = { ...sortie.sante, dismissed: liste }; else delete sortie.sante.dismissed; }
  const json = JSON.stringify(sortie).replace(/<\/(script)/gi, '<\\/$1').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const identifiantFichier = String(g.projet?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'floorplan';
  return { html: html.slice(0, a + DEBUT_DONNEES.length) + json + html.slice(b), name: `${identifiantFichier}-carte.html`, include: retenues, plan: !!g.meta?.ebauche };
}
/** Parcours demandés depuis la carte depuis sa dernière construction, tels que la page les envoie : vérifiés et raccourcis. */
const nettoyerParcours = (liste) => (Array.isArray(liste) ? liste : []).slice(0, 50)
  .filter((f) => f && typeof f.id === 'string' && Array.isArray(f.steps))
  .map((f) => ({
    id: f.id.slice(0, 100), title: String(f.title || 'Parcours').slice(0, 200), description: String(f.description || '').slice(0, 1000), custom: true,
    steps: f.steps.slice(0, 60).filter((s) => s && typeof s.ref === 'string').map((s) => ({ ref: s.ref.slice(0, 300), note: String(s.note || '').slice(0, 2000) })),
  }))
  .filter((f) => f.steps.length >= 2);
if (aOption('export')) {
  const destination = option('export');
  const inclus = String(option('include', EXPORT_PAR_DEFAUT.join(','))).split(',').map((s) => s.trim().toLowerCase());
  try {
    const x = exporterCarte(inclus);
    const fichier = path.resolve(destination && !destination.startsWith('--') ? destination : path.join(ici, x.name));
    fs.writeFileSync(fichier, x.html);
    console.log(`Carte exportée vers ${fichier}`);
    // les clés ['flows'] et ['health'] sont les valeurs de --include, pas des champs du graphe
    const etiquette = { ['flows']: 'les parcours et la visite guidée', notes: 'les notes', recent: 'le travail récent', ['health']: x.plan ? 'la revue du plan' : 'le contrôle de santé' };
    console.log(`Contient : la carte${x.include.map((p) => ', ' + etiquette[p]).join('')}. Un seul fichier qui s’ouvre dans n’importe quel navigateur, sans bulle de questions.`);
    if (x.include.includes('health') && !x.plan) console.log('Il contient le contrôle de santé : quelles adresses du serveur sont ouvertes et où se trouvent les secrets dans le code (jamais leurs valeurs). Ne le partage qu’avec des personnes de confiance.');
    process.exit(0);
  } catch (e) { console.error(`✗ Impossible d’exporter la carte : ${e.message}`); process.exit(1); }
}
const portSouhaite = Number(option('port', 4378));
const delaiInactivite = Number(option('idle-exit', 0)) * 60000; // s’arrêter ce temps après la fermeture du dernier onglet (0 = jamais)
const empreinteCourante = crypto.createHash('sha1').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const modele = option('model', process.env.FLOORPLAN_MODEL || '');
const jeton = crypto.randomBytes(16).toString('hex');
const TYPES_MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// ---------- trouver la CLI qui répond : Claude Code ou Codex ----------
function trouverCommande(sousCommande) {
  try {
    const sortie = execFileSync(process.platform === 'win32' ? 'where' : 'which', [sousCommande], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return sortie.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}
/** Renvoie { cmd, args, path } à lancer, ou null. Gère les installations natives, les raccourcis npm sous Windows et les points d’entrée .js. */
function resoudreCli(candidats, entreeNpm) {
  for (const c of candidats) {
    if (!c || !fs.existsSync(c)) continue;
    if (/\.(m?js)$/i.test(c)) return { cmd: process.execPath, args: [c], path: c };
    if (/\.(cmd|bat|ps1)$/i.test(c) || (process.platform === 'win32' && !path.extname(c))) {
      // raccourci npm : lancer directement son point d’entrée JS avec node (lancer un fichier .cmd demande un shell)
      const cli = path.join(path.dirname(c), 'node_modules', ...entreeNpm);
      if (fs.existsSync(cli)) return { cmd: process.execPath, args: [cli], path: c };
      const executable = c.replace(/\.(cmd|bat|ps1)$/i, '.exe');
      if (executable !== c && fs.existsSync(executable)) return { cmd: executable, args: [], path: executable };
      // les installations npm récentes livrent un vrai programme dans le paquet (bin/claude.exe) et aucun point d’entrée JS ; le raccourci à côté ne peut pas être lancé
      const exeDuPaquet = path.join(path.dirname(c), 'node_modules', ...entreeNpm.slice(0, 2), 'bin', path.basename(c).replace(/\.[^.]*$/, '') + '.exe');
      if (fs.existsSync(exeDuPaquet)) return { cmd: exeDuPaquet, args: [], path: exeDuPaquet };
      continue;
    }
    return { cmd: c, args: [], path: c };
  }
  return null;
}
const DOSSIER_PERSO = process.env.HOME || process.env.USERPROFILE || '';
const fourni = (nom) => { const p = option(nom, process.env['FLOORPLAN_' + nom.toUpperCase()]); return p ? [p] : null; };
/** L’application de bureau Codex garde sa CLI dans un dossier versionné ; le plus récent d’abord. */
function applicationCodex() {
  if (process.platform === 'darwin') return ['/Applications/Codex.app/Contents/Resources/codex'];
  if (process.platform !== 'win32') return [];
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    return fs.readdirSync(base).map((d) => path.join(base, d, 'codex.exe')).filter((f) => fs.existsSync(f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch { return []; }
}
// Les agents qui peuvent répondre, une entrée chacun : son nom, où l’obtenir, comment trouver sa CLI, comment
// lancer une demande (run, plus bas), et si ses réponses suivent un schéma (structured). Modifier un
// plan depuis la carte en a besoin : Modifier n’est donc proposé qu’avec un moteur structuré. schemaFile : la
// CLI lit son schéma dans un fichier plutôt que sur la ligne de commande.
const MOTEURS = {
  claude: {
    name: 'Claude Code CLI', site: 'https://docs.claude.com/en/docs/claude-code', structured: true,
    find: () => resoudreCli(fourni('claude') || [
      ...trouverCommande('claude'),
      path.join(DOSSIER_PERSO, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'),
      ...(process.platform === 'win32' ? [path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')] : []),
    ], ['@anthropic-ai', 'claude-code', 'cli.js']),
    run: lancerClaude,
  },
  codex: {
    name: 'Codex', site: 'https://developers.openai.com/codex', structured: true, schemaFile: true,
    find: () => resoudreCli(fourni('codex') || [...trouverCommande('codex'), ...applicationCodex()], ['@openai', 'codex', 'bin', 'codex.js']),
    run: lancerCodex,
  },
};
// --engine (ou FLOORPLAN_ENGINE) décide ; sinon l’agent qui a construit la carte, puis les autres dans l’ordre
const construitPar = (() => { try { return JSON.parse(fs.readFileSync(path.join(ici, 'graphe.json'), 'utf8')).meta?.agent; } catch { return null; } })();
const moteurDemande = option('engine', process.env.FLOORPLAN_ENGINE);
const estMoteur = (k) => typeof k === 'string' && Object.hasOwn(MOTEURS, k);
const souhaite = estMoteur(moteurDemande) ? moteurDemande : estMoteur(construitPar) ? construitPar : 'claude';
let moteur = null, cli = null;
for (const k of estMoteur(moteurDemande) ? [moteurDemande] : [souhaite, ...Object.keys(MOTEURS).filter((k) => k !== souhaite)]) { cli = MOTEURS[k].find(); if (cli) { moteur = k; break; } }
const peutChanger = !moteur || MOTEURS[moteur].structured;
// Lancé depuis une session Claude Code ou Codex ? Ne pas laisser la CLI croire qu’elle y est imbriquée.
function environnementCli() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^CLAUDE_?CODE_(SESSION|ENTRYPOINT|CHILD|MESSAGING|HOST|SDK)|^CLAUDECODE$|^CODEX_(THREAD_ID|SESSION_ID|TOOL_CALL_ID|CI$|SANDBOX)/.test(k)) delete env[k];
  return env;
}
let version = null;
if (cli) { try { version = execFileSync(cli.cmd, [...cli.args, '--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch {} }

// La page, le graphe, et les consignes et le schéma de réponse (tirés du graph-query intégré à requete.mjs).
// Chargés au démarrage, puis à chaque reconstruction de la carte.
const injection = `<script>window.FLOORPLAN_SERVER=${JSON.stringify({ token: jeton, cli: !!cli, engine: moteur, want: souhaite, version, model: modele || null, change: peutChanger })};</script>`;
let page, G, noyau, MODES;
function charger() {
  const html = fs.readFileSync(path.join(ici, 'index.html'), 'utf8');
  const g = JSON.parse(fs.readFileSync(path.join(ici, 'graphe.json'), 'utf8'));
  const sourceNoyau = fs.readFileSync(path.join(ici, 'requete.mjs'), 'utf8').split('// ---- cli ----')[0];
  const c = new Function(`${sourceNoyau.replace(/^import .*$/gm, '')}; return { FLOORPLAN_SCHEMA_REPONSE, FLOORPLAN_SCHEMA_PARCOURS, FLOORPLAN_SCHEMA_CHANGEMENT, floorplanConsignesQuestion, floorplanConsignesParcours, floorplanConsignesChangement, creerRequetesGraphe };`)();
  c.q = c.creerRequetesGraphe(g);
  page = html.replace('</head>', injection + '</head>');
  G = g; noyau = c;
  // types de demande : une question (réponse + tableau), un nouveau parcours guidé et, pour un plan, une modification du
  // plan. Codex lit son schéma dans un fichier.
  MODES = {
    ask: { instructions: noyau.floorplanConsignesQuestion(G, 'cli'), schema: noyau.FLOORPLAN_SCHEMA_REPONSE, file: path.join(ici, '.cache', 'answer-schema.json') },
    flow: { instructions: noyau.floorplanConsignesParcours(G, 'cli'), schema: noyau.FLOORPLAN_SCHEMA_PARCOURS, file: path.join(ici, '.cache', 'flow-schema.json') },
    ...(G.meta?.ebauche && peutChanger ? { change: { instructions: noyau.floorplanConsignesChangement(G), schema: noyau.FLOORPLAN_SCHEMA_CHANGEMENT, file: path.join(ici, '.cache', 'change-schema.json') } } : {}),
  };
  if (MOTEURS[moteur]?.schemaFile) {
    fs.mkdirSync(path.join(ici, '.cache'), { recursive: true });
    for (const m of Object.values(MODES)) fs.writeFileSync(m.file, JSON.stringify(stricte(m.schema)));
  }
}
/** Les sorties structurées d’OpenAI veulent toutes les propriétés obligatoires et rien en plus ; les listes facultatives reviennent simplement vides. */
function stricte(s) {
  if (s?.type === 'object' && s.properties) return { ...s, properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, stricte(v)])), required: Object.keys(s.properties), additionalProperties: false };
  if (s?.type === 'array') return { ...s, items: stricte(s.items) };
  return s;
}
charger();

// ---------- onglets ouverts : rechargement en direct et arrêt au repos ----------
const onglets = new Set();
let dernierOnglet = Date.now();
const diffuser = (nomEvenement, donnees = {}) => { for (const t of onglets) t.write(`event: ${nomEvenement}\ndata: ${JSON.stringify(donnees)}\n\n`); };
let minuteurRechargement = null;
fs.watchFile(path.join(ici, 'index.html'), { interval: 1000 }, (actuel, precedent) => {
  if (actuel.mtimeMs === precedent.mtimeMs) return;
  // build écrit plusieurs fichiers ; attendre qu’il ait fini, et continuer à servir l’ancienne carte si la nouvelle est à moitié écrite
  clearTimeout(minuteurRechargement);
  minuteurRechargement = setTimeout(() => { try { charger(); diffuser('reload'); console.log('carte reconstruite : onglets ouverts rechargés'); } catch {} }, 800);
});
if (delaiInactivite) setInterval(() => { if (!onglets.size && !enCours.size && Date.now() - dernierOnglet > delaiInactivite) process.exit(0); }, 60000).unref();
const fichierParcours = path.join(ici, 'parcours-perso.json');
const lireParcours = () => { try { return JSON.parse(fs.readFileSync(fichierParcours, 'utf8')).parcours || []; } catch { return []; } };

// ---------- poser des questions ----------
const nomPour = (id) => { try { return noyau.q.brief(id)?.name || id; } catch { return id; } };
const enCours = new Map();
const cheminRelatif = (p) => String(p || '').replace(/\\/g, '/').replace(racine.replace(/\\/g, '/') + '/', '');
/** Une commande shell, en mots : recherches dans la carte par nom, puis recherches, lectures de fichiers et listes. */
function decrireCommande(commandeBrute) {
  let c = String(commandeBrute || '');
  // Codex enveloppe chaque commande dans un shell : bash -lc '…' ou powershell.exe -Command "…"
  const enveloppee = /\s-(?:l?c|Command)\s+(["'])([\s\S]*)\1\s*$/i.exec(c);
  if (enveloppee) c = enveloppee[2].replace(/\\(["'])/g, '$1');
  const commandes = c.split(/\s*(?:&&|;|\|\|?)\s*/).filter(Boolean);
  // les agents enchaînent souvent plusieurs recherches dans une commande ; décrire chacune, par son nom
  const morceaux = commandes.map((x) => /requete\.mjs\s+(\w+)\s*(.*)$/.exec(x)).filter(Boolean);
  if (morceaux.length) {
    const decrireUne = ([, sousCommande, reste]) => {
      const a = reste.replace(/--\w+\s+\S+/g, '').replace(/["']/g, '').trim();
      return { overview: 'Lecture de l’aperçu de la carte', find: a ? `Recherche de "${a}" dans la carte` : 'Recherche dans la carte', show: `Consultation de ${a.split(/\s+/).map(nomPour).join(', ')}`, path: `Recherche d’un chemin ${a.split(/\s+/).map(nomPour).join(' → ')}` }[sousCommande] || 'Interrogation de la carte';
    };
    return morceaux.slice(0, 2).map(decrireUne).join(' · ') + (morceaux.length > 2 ? ` (+${morceaux.length - 2} de plus)` : '');
  }
  const premier = commandes[0] || '';
  if (/^(rg|grep|git grep|Select-String|findstr)\b/i.test(premier) && !/\s--files\b/.test(premier)) {
    const motif = /\s(["'])(.+?)\1/.exec(premier)?.[2] || /\s(?:-Pattern\s+)?([^\s-][^\s]*)/i.exec(premier.replace(/^\S+(\s+-\S+)*/, ''))?.[1];
    return motif ? `Recherche de "${motif}" dans le code` : 'Recherche dans le code';
  }
  if (/^(rg\s.*--files|ls|dir|Get-ChildItem|gci|find|tree)\b/i.test(premier)) return 'Liste des fichiers';
  if (/^(cat|type|Get-Content|gc|sed|head|tail|nl|more|less)\b/i.test(premier)) {
    const fichier = [...premier.matchAll(/[\w@.\\/-]+\.\w{1,6}\b/g)].map((m) => m[0]).pop();
    return fichier ? `Lecture de ${cheminRelatif(fichier)}` : 'Lecture d’un fichier';
  }
  return 'Exécution d’une commande';
}
function decrireOutil(nom, entree = {}) {
  if (nom === 'Bash') return decrireCommande(entree.command);
  // un long résultat que la CLI a enregistré pour le relire par morceaux se trouve hors du projet
  if (nom === 'Read') return /[\\/]tool-results[\\/]/.test(entree.file_path || '') ? 'Lecture de la suite d’un long fichier' : `Lecture de ${cheminRelatif(entree.file_path)}`;
  if (nom === 'Grep') return `Recherche de "${entree.pattern}" dans le code`;
  if (nom === 'Glob') return `Liste de ${entree.pattern}`;
  return nom;
}
function lireReponse(evenement) {
  if (evenement.structured_output && typeof evenement.structured_output === 'object') return evenement.structured_output;
  const t = String(evenement.result || '');
  const clotureCode = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  for (const candidat of [t, clotureCode?.[1], t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) { try { const v = JSON.parse(candidat); if (v && typeof v === 'object') return v; } catch {} }
  return { title: 'Réponse', answer: t, items: [] };
}
const codeErreur = (texteMessage) => /not logged in|logged out|\/login|log ?in again|sign in|authenticat|unauthori[sz]ed|\b401\b/i.test(texteMessage) ? 'not_logged_in'
  : /usage limit|rate limit|too many requests|\b429\b/i.test(texteMessage) ? 'rate_limited' : 'cli_error';
// fichiers que la bulle de questions n’ouvre jamais : leur contenu arriverait chez le fournisseur d’IA
const FICHIERS_SECRETS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/id_rsa', '**/id_ed25519', '**/*secret*', '**/*token*', '**/*credential*', '**/.ssh/**', '**/.aws/**'];
// Claude Code : `claude -p` avec des outils en lecture seule, qui répond dans le schéma ; les questions suivantes reprennent sa session
function lancerClaude(corps, mode) {
  const params = [...cli.args, '-p', '--output-format', 'stream-json', '--verbose',
    '--json-schema', JSON.stringify(mode.schema), '--append-system-prompt', mode.instructions,
    '--tools', 'Read,Grep,Glob,Bash', '--allowedTools', 'Bash(node floorplan/requete.mjs:*)', 'Read', 'Grep', 'Glob',
    '--disallowedTools', ...FICHIERS_SECRETS.map((f) => `Read(${f})`),
    // sans les serveurs MCP de l’ordinateur : leurs listes d’outils suffisent à faire déborder la demande
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];
  if (corps.session) params.push('--resume', String(corps.session));
  if (modele) params.push('--model', modele);
  return {
    args: params, input: String(corps.question || '').slice(0, 4000),
    onEvent(evenement, sortie) {
      if (evenement.type === 'assistant') for (const c of evenement.message?.content || []) if (c.type === 'tool_use') sortie.progress(decrireOutil(c.name, c.input));
      if (evenement.type !== 'result') return;
      if (evenement.is_error) sortie.fail(String(evenement.result || evenement.subtype || 'Claude Code a signalé une erreur'));
      else sortie.answer({ ...lireReponse(evenement), session: evenement.session_id });
    },
  };
}
// Codex : `codex exec` dans son bac à sable en lecture seule, qui répond dans le schéma. Les exécutions sont éphémères (rien n’arrive
// dans l’historique Codex de la personne) : une question de suite emporte donc avec elle les dernières questions et réponses.
const conversations = new Map();
function lancerCodex(corps, mode) {
  const session = conversations.has(corps.session) ? corps.session : crypto.randomBytes(8).toString('hex');
  const echanges = conversations.get(session) || [];
  const question = String(corps.question || '').slice(0, 4000);
  const precedents = echanges.length ? `\n\nPlus tôt dans cette conversation :\n${echanges.map((t) => `Q : ${t.q}\nR : ${t.a}`).join('\n\n')}` : '';
  const params = [...cli.args, 'exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral',
    '--output-schema', mode.file, '-C', racine];
  if (modele) params.push('--model', modele);
  params.push('-');
  let dernier = '', erreur = '';
  return {
    args: params, input: `${mode.instructions}${precedents}\n\nLa question :\n${question}`,
    onEvent(evenement, sortie) {
      if (evenement.type === 'item.started' && evenement.item?.type === 'command_execution') sortie.progress(decrireCommande(evenement.item.command));
      if (evenement.type === 'item.completed' && evenement.item?.type === 'agent_message') dernier = String(evenement.item.text || '');
      if (evenement.type === 'error') erreur = String(evenement.message || erreur);
      if (evenement.type === 'turn.failed') sortie.fail(String(evenement.error?.message || erreur || 'Codex a signalé une erreur'));
      if (evenement.type === 'turn.completed') {
        const a = lireReponse({ result: dernier });
        conversations.set(session, [...echanges, { q: question.slice(0, 500), a: String(a.answer || '').slice(0, 1500) }].slice(-4));
        sortie.answer({ ...a, session });
      }
    },
    lastError: () => erreur,
  };
}
const FERME = Symbol('closed'); // le navigateur est parti en pleine demande
/** Lance l’agent une fois pour une demande et rend sa réponse, en envoyant l’avancement par `send`. */
function lancerAgent(reponse, envoyer, corps) {
  return new Promise((resoudre, rejeter) => {
    const execution = MOTEURS[moteur].run(corps, MODES[corps.mode] || MODES.ask);
    const enfant = spawn(cli.cmd, execution.args, { cwd: racine, env: environnementCli(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const id = crypto.randomBytes(6).toString('hex');
    enCours.set(id, enfant);
    envoyer('start', { id });
    enfant.stdin.end(execution.input);
    let tampon = '', stderr = '', termine = false;
    // réfléchir à un plan mis à jour et l’écrire en entier comporte de longs moments sans rien à signaler : le dire après un temps de silence
    let delaiSilence = null, dit = '';
    const dire = (texte) => { if (!termine && texte !== dit) { dit = texte; envoyer('progress', { text: texte }); } };
    const armerSilence = () => { clearTimeout(delaiSilence); if (corps.mode === 'change' && !termine) delaiSilence = setTimeout(() => dire('Travail sur le plan mis à jour'), 12000); };
    const sortie = {
      progress: (texte) => { if (!termine) { dire(texte); armerSilence(); } },
      answer: (donnees) => { if (!termine) { termine = true; clearTimeout(delaiSilence); resoudre(donnees); } },
      fail: (message) => { if (!termine) { termine = true; clearTimeout(delaiSilence); rejeter(new Error(message)); } },
    };
    armerSilence();
    enfant.stdout.on('data', (d) => {
      tampon += d;
      let positionRetour;
      while ((positionRetour = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, positionRetour).trim(); tampon = tampon.slice(positionRetour + 1);
        if (!ligne) continue;
        let evenement; try { evenement = JSON.parse(ligne); } catch { continue; }
        execution.onEvent(evenement, sortie);
      }
    });
    enfant.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    enfant.on('error', (e) => sortie.fail(e.message));
    enfant.on('close', (code) => {
      enCours.delete(id);
      sortie.fail(execution.lastError?.() || stderr.trim() || `${moteur} s’est arrêté avec le code ${code}`);
    });
    // le navigateur est parti (onglet fermé, Arrêter) : ne pas laisser la CLI travailler. Note : req 'close' se déclenche dès que
    // le corps est lu, donc surveiller plutôt la réponse.
    reponse.on('close', () => { if (!termine) { termine = true; clearTimeout(delaiSilence); enfant.kill(); rejeter(FERME); } });
  });
}
function demander(requete, reponse, corps) {
  reponse.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const envoyer = (nomEvenement, donnees) => { if (!reponse.writableEnded) reponse.write(`event: ${nomEvenement}\ndata: ${JSON.stringify(donnees)}\n\n`); };
  if (!cli) { envoyer('failure', { code: 'cli_missing', message: `${MOTEURS[souhaite].name} est introuvable.` }); return reponse.end(); }
  if (corps.mode === 'change') return changerPlan(reponse, envoyer, corps);
  lancerAgent(reponse, envoyer, corps)
    .then((a) => envoyer('answer', a), (e) => { if (e !== FERME) envoyer('failure', { code: codeErreur(e.message), message: e.message }); })
    .finally(() => reponse.end());
}

// ---------- modifier un plan depuis la carte ----------
// L’agent reste en lecture seule : il renvoie les plan.json et architecture.json mis à jour en entier, et ce serveur
// les vérifie avec plan.mjs et construire.mjs du skill (construire.mjs note où ils sont), les enregistre et
// redessine la carte, ce qui recharge tous les onglets ouverts. Chaque modification garde les fichiers qu’elle a remplacés, pour Annuler.
const dossierHistorique = path.join(ici, '.cache', 'history');
const FICHIERS_PLAN = ['plan.json', 'architecture.json', 'travail-recent.json'];
let changementEnCours = false;
function prendreInstantane() {
  const dossier = path.join(dossierHistorique, Date.now().toString(36));
  fs.mkdirSync(dossier, { recursive: true });
  for (const f of FICHIERS_PLAN) if (fs.existsSync(path.join(ici, f))) fs.copyFileSync(path.join(ici, f), path.join(dossier, f));
  for (const ancien of fs.readdirSync(dossierHistorique).sort().slice(0, -20)) fs.rmSync(path.join(dossierHistorique, ancien), { recursive: true, force: true });
  return dossier;
}
function restaurer(dossier) {
  for (const f of FICHIERS_PLAN) { const origine = path.join(dossier, f), vers = path.join(ici, f); if (fs.existsSync(origine)) fs.copyFileSync(origine, vers); else fs.rmSync(vers, { force: true }); }
}
/** Lance un des scripts du skill sur ce projet ; lève une erreur avec sa sortie s’il échoue. */
function scriptSkill(nom, ...params) {
  let dossier;
  try { dossier = JSON.parse(fs.readFileSync(path.join(ici, '.cache', 'skill.json'), 'utf8')).dir; } catch {}
  if (!dossier || !fs.existsSync(path.join(dossier, 'scripts', nom))) throw new Error('Le serveur de cette carte ne trouve pas les scripts de Floorplan. Demande à Claude Code ou à Codex de mettre le floorplan à jour une fois, puis réessaie.');
  try { return execFileSync(process.execPath, [path.join(dossier, 'scripts', nom), racine, ...params], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 120000 }); }
  catch (e) { throw Object.assign(new Error(String(e.stdout || '') + String(e.stderr || '') || e.message), { checks: true }); }
}
/** Les lignes « - … » sous le titre « ✗ N erreur(s) » des scripts (les avertissements suivent sous « ! »). */
function problemes(texte) {
  const sortie = [];
  let dansErreurs = false;
  for (const l of String(texte || '').split('\n')) {
    if (/^✗/.test(l)) dansErreurs = true;
    else if (/^\S/.test(l)) dansErreurs = false;
    else if (dansErreurs && /^\s+- /.test(l)) sortie.push(l.trim().slice(2));
  }
  return sortie;
}
/** Vérifie et enregistre un plan mis à jour. Renvoie { ok, undo } ou { errors } sans rien avoir changé. */
function appliquerChangement(donnees, demande, dernierEssai) {
  const lireObjet = (nom, texte) => { try { const v = JSON.parse(String(texte || '')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  const plan = lireObjet('plan', donnees.plan), archi = lireObjet('architecture', donnees.architecture);
  if (!plan || !archi) return { errors: [`${!plan ? 'plan' : 'architecture'} n’est pas un objet JSON complet`] };
  const instantane = prendreInstantane();
  const ecrire = (f, v) => fs.writeFileSync(path.join(ici, f), JSON.stringify(v, null, 2) + '\n');
  try {
    ecrire('plan.json', plan);
    ecrire('architecture.json', archi);
    const elements = (Array.isArray(donnees.changes) ? donnees.changes : []).filter((c) => c && typeof c.ref === 'string').map((c) => ({ ref: c.ref, change: c.change === 'changed' ? 'changed' : 'new', note: String(c.note || '') }));
    // le panneau Travail récent affiche du texte simple : le premier paragraphe du résumé, sans marques Markdown
    const texteSimple = String(donnees.summary || '').split(/\n\s*\n/)[0].replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
    ecrire('travail-recent.json', { updatedAt: new Date().toISOString(), tasks: [{ title: String(donnees.title || 'Plan modifié').slice(0, 80), request: demande, summary: texteSimple, status: 'prévu, pas encore construit', items: elements }] });
    scriptSkill('plan.mjs');
    const verification = scriptSkill('construire.mjs', '--check');
    const nonAffectes = +(/(\d+) non affectés/.exec(verification)?.[1] || 0);
    if (nonAffectes && !dernierEssai) throw Object.assign(new Error(''), { checks: true, list: [`${nonAffectes} fichier(s) prévu(s) ne tombent dans les paths d’aucune partie de architecture.json (ajoute ou élargis des motifs)`] });
    scriptSkill('construire.mjs', '--no-claude-md');
    return { ok: true, undo: path.basename(instantane) };
  } catch (e) {
    restaurer(instantane);
    fs.rmSync(instantane, { recursive: true, force: true });
    try { scriptSkill('plan.mjs'); } catch {}
    if (!e.checks) throw e;
    return { errors: e.list || problemes(e.message).slice(0, 12).concat(problemes(e.message).length ? [] : [e.message.trim().split('\n').pop()]) };
  }
}
async function changerPlan(reponse, envoyer, corps) {
  const demande = String(corps.question || '').slice(0, 4000);
  if (!MODES.change) { envoyer('failure', { code: 'cli_error', message: G.meta?.ebauche ? `${MOTEURS[moteur].name} ne peut pas modifier un plan depuis la carte.` : 'Seul un plan peut être modifié depuis la carte.' }); return reponse.end(); }
  if (changementEnCours) { envoyer('failure', { code: 'busy', message: 'Une autre modification de ce plan est encore en cours. Réessaie quand elle sera terminée.' }); return reponse.end(); }
  changementEnCours = true;
  let session, erreurs = null;
  try {
    for (let tentative = 0; tentative < 2; tentative++) {
      const question = erreurs
        ? `Ton plan mis à jour n’a pas passé les contrôles, donc rien n’a été enregistré :\n${erreurs.map((e) => `- ${e}`).join('\n')}\n\nCorrige ces points et réponds à nouveau avec les fichiers complets. La demande était : ${demande}`
        : demande;
      const donnees = await lancerAgent(reponse, envoyer, { question, session, mode: 'change' });
      session = donnees.session || session;
      envoyer('progress', { text: 'Vérification du plan mis à jour' });
      const r = appliquerChangement(donnees, demande, tentative === 1);
      if (r.ok) {
        console.log(`plan modifié : ${donnees.title || demande.slice(0, 60)}`);
        envoyer('answer', { title: String(donnees.title || ''), summary: String(donnees.summary || ''), changes: (donnees.changes || []).length, followups: Array.isArray(donnees.followups) ? donnees.followups.map(String).slice(0, 3) : [], undo: r.undo });
        return;
      }
      erreurs = r.errors;
      envoyer('progress', { text: `${erreurs.length === 1 ? 'Correction d’un problème trouvé' : `Correction de ${erreurs.length} problèmes trouvés`} par les contrôles` });
    }
    envoyer('failure', { code: 'change_invalid', message: `Le plan mis à jour n’a pas passé les contrôles, donc rien n’a changé :\n${erreurs.slice(0, 6).map((e) => `- ${e}`).join('\n')}` });
  } catch (e) {
    if (e !== FERME) envoyer('failure', { code: codeErreur(String(e.message || e)), message: String(e.message || e) });
  } finally { changementEnCours = false; reponse.end(); }
}
/** Remet les fichiers qu’une modification a remplacés (le plus récent d’abord), et redessine. */
function annulerChangement() {
  const tous = fs.existsSync(dossierHistorique) ? fs.readdirSync(dossierHistorique).sort() : [];
  if (!tous.length) return { ok: false, error: 'Rien à annuler.' };
  const dossier = path.join(dossierHistorique, tous[tous.length - 1]);
  restaurer(dossier);
  try { scriptSkill('plan.mjs'); scriptSkill('construire.mjs', '--no-claude-md'); } catch (e) {
    console.error(`✗ L’annulation n’a pas pu redessiner le plan : ${e.message || e}`);
    return { ok: false, error: 'Impossible de redessiner le plan précédent. Le détail est dans la sortie du serveur de la carte.' };
  }
  fs.rmSync(dossier, { recursive: true, force: true });
  return { ok: true, left: tous.length - 1 };
}

// ---------- http ----------
const serveur = http.createServer((requete, reponse) => {
  // seulement les noms propres à cet ordinateur : un site web qui dirige son domaine vers 127.0.0.1 (DNS rebinding) compterait
  // sinon comme de la même origine que la carte, et pourrait lire son jeton dans la page
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(String(requete.headers.host || '').toLowerCase())) { reponse.writeHead(403); return reponse.end('hôte inconnu'); }
  const url = new URL(requete.url, `http://${requete.headers.host}`);
  const memeOrigine = !requete.headers.origin || requete.headers.origin === `http://${requete.headers.host}`;
  if (url.pathname.startsWith('/api/')) {
    // EventSource ne peut pas envoyer d’en-têtes, donc le flux d’événements prend le jeton dans l’adresse
    const fourni = requete.headers['x-floorplan-token'] || (url.pathname === '/api/events' ? url.searchParams.get('token') : null);
    if (!memeOrigine || fourni !== jeton) { reponse.writeHead(403); return reponse.end(); }
    if (requete.method === 'GET' && url.pathname === '/api/events') {
      reponse.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      reponse.write('retry: 1000\n\n'); // se reconnecter vite après un redémarrage
      onglets.add(reponse);
      requete.on('close', () => { onglets.delete(reponse); dernierOnglet = Date.now(); });
      return;
    }
    if (requete.method === 'GET' && url.pathname === '/api/status') { reponse.writeHead(200, { 'Content-Type': 'application/json' }); return reponse.end(JSON.stringify({ tabs: onglets.size, pid: process.pid, hash: empreinteCourante, root: racine })); }
    if (requete.method === 'GET' && url.pathname === '/api/health') { reponse.writeHead(200, { 'Content-Type': 'application/json' }); return reponse.end(JSON.stringify({ cli: !!cli, engine: moteur, want: souhaite, version, path: cli?.path || null })); }
    // les parcours demandés sont enregistrés à côté de la carte ; construire.mjs les range dans graphe.json
    if (url.pathname === '/api/flows') {
      if (requete.method === 'GET') { reponse.writeHead(200, { 'Content-Type': 'application/json' }); return reponse.end(JSON.stringify({ parcours: lireParcours() })); }
      if (requete.method === 'POST' || requete.method === 'DELETE') {
        let brut = '';
        requete.on('data', (d) => { brut += d; if (brut.length > 50000) requete.destroy(); });
        requete.on('end', () => {
          let corps = {}; try { corps = JSON.parse(brut); } catch {}
          let parcoursListe = lireParcours().filter((x) => x.id !== corps.id && x.id !== corps.flow?.id);
          if (requete.method === 'POST' && corps.flow?.id && Array.isArray(corps.flow.steps)) parcoursListe.push({ ...corps.flow, createdAt: new Date().toISOString() });
          fs.writeFileSync(fichierParcours, JSON.stringify({ parcours: parcoursListe }, null, 2) + '\n');
          reponse.writeHead(200, { 'Content-Type': 'application/json' }); reponse.end(JSON.stringify({ parcours: parcoursListe }));
        });
        return;
      }
    }
    if (url.pathname === '/api/health/dismissed') {
      if (requete.method === 'GET') { reponse.writeHead(200, { 'Content-Type': 'application/json' }); return reponse.end(JSON.stringify({ dismissed: lireRejets() })); }
      if (requete.method === 'POST' || requete.method === 'DELETE') {
        let brut = '';
        requete.on('data', (d) => { brut += d; if (brut.length > 100000) requete.destroy(); });
        requete.on('end', () => {
          let corps = {}; try { corps = JSON.parse(brut); } catch {}
          if (typeof corps.id !== 'string') { reponse.writeHead(400); return reponse.end(); }
          const rejetes = lireRejets().filter((x) => x.id !== corps.id);
          if (requete.method === 'POST') rejetes.push(nettoyerRejet(corps));
          fs.writeFileSync(fichierRejets, JSON.stringify({ dismissed: rejetes }, null, 2) + '\n');
          reponse.writeHead(200, { 'Content-Type': 'application/json' }); reponse.end(JSON.stringify({ dismissed: rejetes }));
        });
        return;
      }
    }
    if (requete.method === 'POST' && url.pathname === '/api/plan/undo') {
      const r = changementEnCours ? { ok: false, error: 'Une modification est encore en cours.' } : annulerChangement();
      reponse.writeHead(200, { 'Content-Type': 'application/json' }); return reponse.end(JSON.stringify(r));
    }
    if (requete.method === 'POST' && url.pathname === '/api/cancel') { for (const c of enCours.values()) c.kill(); reponse.writeHead(204); return reponse.end(); }
    if (requete.method === 'POST' && url.pathname === '/api/export') {
      let brut = '';
      requete.on('data', (d) => { brut += d; if (brut.length > 500000) requete.destroy(); });
      requete.on('end', () => {
        let corps = {}; try { corps = JSON.parse(brut); } catch {}
        try {
          const x = exporterCarte(Array.isArray(corps.include) ? corps.include.map(String) : EXPORT_PAR_DEFAUT, nettoyerParcours(corps.parcours));
          reponse.writeHead(200, { 'Content-Type': TYPES_MIME['.html'], 'Content-Disposition': `attachment; filename="${x.name}"`, 'Cache-Control': 'no-store' });
          reponse.end(x.html);
        } catch (e) {
          console.error(`✗ Impossible d’exporter la carte : ${e.message}`);
          reponse.writeHead(500, { 'Content-Type': 'application/json' });
          reponse.end(JSON.stringify({ error: e.plain ? e.message : 'Le serveur de la carte n’a pas pu l’exporter. Le détail est dans sa sortie.' }));
        }
      });
      return;
    }
    if (requete.method === 'POST' && url.pathname === '/api/ask') {
      let brut = '';
      requete.on('data', (d) => { brut += d; if (brut.length > 20000) requete.destroy(); });
      requete.on('end', () => { let corps = {}; try { corps = JSON.parse(brut); } catch {} demander(requete, reponse, corps); });
      return;
    }
    reponse.writeHead(404); return reponse.end();
  }
  if (url.pathname === '/' || url.pathname === '/index.html') { reponse.writeHead(200, { 'Content-Type': TYPES_MIME['.html'], 'Cache-Control': 'no-store' }); return reponse.end(page); }
  let fichier;
  try { fichier = path.join(ici, decodeURIComponent(url.pathname)); } catch { reponse.writeHead(400); return reponse.end('adresse invalide'); }
  // seulement dans ce dossier : un voisin comme ../floorplan-old/ commence aussi par le chemin de ce dossier
  if (!fichier.startsWith(ici + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) { reponse.writeHead(404); return reponse.end('introuvable'); }
  reponse.writeHead(200, { 'Content-Type': TYPES_MIME[path.extname(fichier)] || 'application/octet-stream' });
  fs.createReadStream(fichier).pipe(reponse);
});
// une autre carte (ou autre chose) sur ce port : prendre le suivant de libre
let port = portSouhaite;
serveur.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port < portSouhaite + 20) { port++; serveur.listen(port, '127.0.0.1'); return; }
  console.error(`✗ Impossible de démarrer le serveur de la carte : ${e.message}`);
  process.exit(1);
});
serveur.listen(port, '127.0.0.1');
serveur.on('listening', () => {
  const u = `http://127.0.0.1:${port}`;
  try {
    fs.mkdirSync(path.dirname(fichierEtat), { recursive: true });
    fs.writeFileSync(fichierEtat, JSON.stringify({ pid: process.pid, port, url: u, token: jeton, hash: empreinteCourante, startedAt: new Date().toISOString() }, null, 2));
  } catch {}
  const oublier = () => { try { if (lireEtat()?.pid === process.pid) fs.unlinkSync(fichierEtat); } catch {} };
  process.on('exit', oublier);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => process.exit(0));
  console.log(`Floorplan: ${u}`);
  console.log(cli
    ? `questions via ${MOTEURS[moteur].name} ${version || ''} (${cli.path})${modele ? `, modèle ${modele}` : ''}`
    : `${MOTEURS[souhaite].name} est introuvable : la carte marche, mais poser des questions en a besoin (${MOTEURS[souhaite].site}). Ajoute --${souhaite} <chemin> s’il est installé dans un endroit inhabituel.`);
  if (!aOption('no-open')) {
    const ouvreur = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
    try { spawn(ouvreur[0], ouvreur[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
  }
});
