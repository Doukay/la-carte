#!/usr/bin/env node
// Montrer la carte à la personne après une construction ou une mise à jour. Réutilise le serveur de cette carte s’il tourne (les onglets
// ouverts se sont déjà rechargés), le redémarre si serveur.mjs a changé, sinon le lance en
// arrière-plan et ouvre un onglet du navigateur. Affiche l’adresse et la façon de l’arrêter.
// usage : node ouvrir.mjs [racine] [--no-open] [--port N] [--model M] [--claude CHEMIN]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { lireArguments, dossierCarte } from './lib/commun.mjs';

const params = lireArguments(process.argv.slice(2));
const racine = path.resolve(params._[0] || '.');
const dossier = dossierCarte(racine);
const fichierServe = path.join(dossier, '.cache', 'serveur.mjs');
const fichierEtat = path.join(dossier, '.cache', 'server.json');
const cheminRelatif = path.relative(process.cwd(), dossier).replace(/\\/g, '/') || '.';
const MINUTES_INACTIF = 120;

if (!fs.existsSync(path.join(dossier, 'index.html')) || !fs.existsSync(fichierServe)) {
  console.error('✗ Il n’y a pas encore de carte construite ici. Lance d’abord construire.mjs.');
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const lireEtat = () => { try { const s = JSON.parse(fs.readFileSync(fichierEtat, 'utf8')); return /^http:\/\/127\.0\.0\.1:\d+$/.test(s.url) ? s : null; } catch { return null; } };
const vivant = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function appelApi(s, p) {
  try {
    const r = await fetch(s.url + p, { headers: { 'x-la-carte-token': s.token }, signal: AbortSignal.timeout(3000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
function ouvrirNavigateur(u) {
  const [commande, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(commande, a, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); return true; } catch { return false; }
}
const empreinte = crypto.createHash('sha1').update(fs.readFileSync(fichierServe)).digest('hex').slice(0, 12);

let s = lireEtat();
let statut = s?.pid && vivant(s.pid) ? await appelApi(s, '/api/status') : null;
let redemarre = false;
const avaitOnglets = statut?.tabs > 0;

if (statut && statut.hash !== empreinte) {
  // un serveur.mjs plus récent est arrivé avec cette construction : redémarrer pour que la carte l’ait ; les onglets ouverts se reconnectent et se rechargent
  try { process.kill(s.pid); } catch {}
  for (let i = 0; i < 20 && vivant(s.pid); i++) await dormir(150);
  statut = null;
  redemarre = true;
}

if (!statut) {
  const transmis = ['port', 'model', 'claude'].flatMap((k) => (params[k] ? ['--' + k, String(params[k])] : []));
  if (!params.port && s?.port) transmis.push('--port', String(s.port)); // garder l’adresse que la personne a déjà ouverte
  fs.mkdirSync(path.dirname(fichierEtat), { recursive: true });
  const journal = fs.openSync(path.join(dossier, '.cache', 'server.log'), 'w');
  const precedent = s?.pid;
  spawn(process.execPath, [fichierServe, '--no-open', '--idle-exit', String(MINUTES_INACTIF), ...transmis], {
    cwd: racine, detached: true, stdio: ['ignore', journal, journal], windowsHide: true,
  }).unref();
  // trouver la CLI Claude Code prend quelques secondes avant que le serveur écoute
  for (let i = 0; i < 100; i++) {
    await dormir(200);
    const n = lireEtat();
    if (n?.pid && n.pid !== precedent && vivant(n.pid)) { s = n; statut = await appelApi(s, '/api/status'); if (statut) break; }
  }
  if (!statut) {
    console.error(`✗ Le serveur de la carte n’a pas démarré. Son journal est dans ${cheminRelatif}/.cache/server.log. La carte s’ouvre quand même comme un fichier : ${cheminRelatif}/index.html`);
    process.exit(1);
  }
  // les onglets d’avant un redémarrage reviennent tout seuls en quelques secondes
  if (redemarre && avaitOnglets) for (let i = 0; i < 50 && !(statut?.tabs > 0); i++) { await dormir(200); statut = await appelApi(s, '/api/status'); }
}

const controle = await appelApi(s, '/api/health');
let affichage;
if (statut.tabs > 0) affichage = `déjà ouverte dans ${statut.tabs === 1 ? 'un onglet du navigateur' : statut.tabs + ' onglets du navigateur'}, mis à jour avec la dernière carte`;
else if (params['no-open']) affichage = 'pas ouverte dans un navigateur (--no-open) : ouvre l’adresse toi-même';
else affichage = ouvrirNavigateur(s.url) ? 'ouverte dans le navigateur' : 'impossible d’ouvrir un navigateur : ouvre l’adresse toi-même';

console.log(`LA_CARTE  ${s.url}  (${affichage})`);
console.log(controle?.cli
  ? `DEMANDER  fonctionne : les questions passent par la CLI Claude Code${controle.version ? ' (' + controle.version + ')' : ''}`
  : 'DEMANDER  a besoin de la CLI Claude Code, introuvable ; la carte elle-même marche (https://docs.claude.com/en/docs/claude-code)');
console.log(`SERVEUR  tourne en arrière-plan, met à jour les onglets ouverts quand la carte est reconstruite, et s’arrête ${MINUTES_INACTIF / 60} heures après la fermeture du dernier onglet. Pour l’arrêter maintenant : node ${cheminRelatif}/serveur.mjs --stop`);
