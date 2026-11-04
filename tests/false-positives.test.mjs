// Deux sortes de fausses alertes signalées par un utilisateur sur l’onglet Santé, et la sortie pour le reste. Une empreinte de mot de passe
// n’est pas le mot de passe, et une sauvegarde chiffrée n’est pas une sauvegarde exposée. Ce que les contrôles se trompent encore à signaler peut être
// marqué « pas un problème » sur la carte : enregistré à côté, mis à part, hors des compteurs, de retour si la découverte change.
// Les valeurs qui ressemblent à des secrets sont assemblées à l’exécution pour qu’aucune ne soit jamais versée dans ce dépôt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { lib, makeProject, shopApp, run, scanAndBuild, readGraph, cleanup, FAKE_PASSWORD } from './helpers.mjs';

const { trouverProblemes, variablePubliqueFuyante, valeurProtegee, rejetPour, avecRejets } = await lib('health.mjs');
const secrets = (source, p = 'app/config.py', lang = 'python') => trouverProblemes(source, { path: p, category: 'code', lang }).filter((x) => x.k === 'secret');
const BCRYPT = '$2b$12$' + 'aBcD1e2F3g4H5i6J7k8L9m'.repeat(2) + 'n0P3q4R5s6';
const ARGON = '$argon2id$v=19$m=65536,t=3,p=4$' + 'c2FsdHNhbHQ' + '$' + 'aGFzaGhhc2hoYXNo';
const ARCHI = { projet: { name: 'App', summary: 'A sample app.' }, nodes: [{ id: 'app', label: 'App', kind: 'ui', summary: 'The app.', paths: ['**'] }] };
const FAUX_JETON_GITHUB = 'ghp_' + 'aBcD' + '1e2F3g4H5i6J7k8L9m0N1o2P3q4R5s6T7u8V';
const BLOB = 'Zm9vYmFyYmF6cXV4'.repeat(4);
const CHIFFRES = { dotenvx: 'encrypted:' + BLOB, sops: `ENC[AES256_GCM,data:${BLOB},iv:abc,tag:def,type:str]`, openssl: 'U2FsdGVkX1' + BLOB, fernet: 'gAAAAA' + BLOB, vault: 'vault:v1:' + BLOB };

// ---------- 1. une empreinte n’est pas le mot de passe ----------
test('une empreinte de mot de passe n’est pas signalée comme un mot de passe', () => {
  assert.deepEqual(secrets(`DB_PASSWORD = "${BCRYPT}"\nADMIN_PASSWORD = "${ARGON}"\n`), []);
  assert.deepEqual(secrets(`ADMIN_PASSWORD_HASH = "${FAKE_PASSWORD}"\nhashed_password = "${FAKE_PASSWORD}"\n`), []);
  assert.deepEqual(secrets(`const adminPasswordHash = "${FAKE_PASSWORD}";`, 'app/config.ts', 'typescript'), []);
});

test('le même mot de passe sous un nom ordinaire est toujours signalé', () => {
  assert.equal(secrets(`DB_PASSWORD = "${FAKE_PASSWORD}"`).length, 1);
});

test('un nom n’excuse qu’une empreinte, pas le secret qui la fabrique, et jamais un vrai format de clé', () => {
  for (const nom of ['HASH_SECRET', 'HASH_TOKEN', 'JWT_HASH_SECRET']) assert.equal(secrets(`${nom} = "${FAKE_PASSWORD}"`).length, 1, nom);
  assert.equal(secrets(`PASSWORD_HASH = "${FAUX_JETON_GITHUB}"`).length, 1);
});

test('une empreinte dans une variable du navigateur n’est pas un secret qui fuit, alors qu’un mot de passe y reste un secret', () => {
  assert.equal(variablePubliqueFuyante('VITE_ADMIN_PASSWORD_HASH'), null);
  assert.notEqual(variablePubliqueFuyante('VITE_ADMIN_PASSWORD'), null);
});

const problemesVariableNavigateur = (valeur) => {
  const racine = makeProject({
    'app/.env.production': `VITE_ADMIN_PASSWORD=${valeur}\n`,
    'app/package.json': '{"name":"a","dependencies":{"vite":"5"}}',
    'app/src/main.js': `console.log(import.meta.env.VITE_ADMIN_PASSWORD);\n`,
  }, { repos: ['app'], arch: ARCHI });
  try {
    scanAndBuild(racine);
    return readGraph(racine).sante.problemes.filter((i) => i.kind === 'public-env-secret');
  } finally { cleanup(racine); }
};

test('une variable du navigateur dont la valeur est une empreinte ne soulève rien, et la même avec un mot de passe soulève un problème', () => {
  assert.deepEqual(problemesVariableNavigateur(BCRYPT), []);
  assert.equal(problemesVariableNavigateur(FAKE_PASSWORD).length, 1);
});

// ---------- 2. une sauvegarde chiffrée n’est pas exposée ----------
test('les valeurs chiffrées sont reconnues dans tous les formats courants', () => {
  for (const [quoi, v] of Object.entries(CHIFFRES)) assert.ok(valeurProtegee(v), quoi);
  assert.ok(!valeurProtegee(FAKE_PASSWORD));
  assert.ok(!valeurProtegee(BLOB), 'un texte d’allure aléatoire n’est pas une preuve de chiffrement');
});

const problemesEnv = (corps, nom = '.env.backup') => {
  const racine = makeProject({ [`app/${nom}`]: corps, 'app/index.js': 'console.log(1);\n' }, { repos: ['app'], arch: ARCHI });
  try {
    scanAndBuild(racine);
    return readGraph(racine).sante.problemes.filter((i) => i.kind === 'env-file');
  } finally { cleanup(racine); }
};

test('une sauvegarde .env chiffrée n’est pas signalée comme un fichier de réglages exposé', () => {
  assert.deepEqual(problemesEnv(Object.entries(CHIFFRES).map(([k, v]) => `${k.toUpperCase()}_PASSWORD=${v}`).join('\n') + '\n'), []);
});

test('une sauvegarde avec une valeur non chiffrée est quand même signalée, pour cette valeur seulement', () => {
  const [probleme, ...reste] = problemesEnv(`A_PASSWORD=${CHIFFRES.sops}\nB_PASSWORD=${FAKE_PASSWORD}\n`);
  assert.equal(reste.length, 0);
  assert.deepEqual(probleme.locations.map((l) => l.line), [2]);
});

test('une clé privée protégée par une phrase secrète est laissée tranquille, une clé en clair non', () => {
  const corps = 'MIIE' + 'abcd'.repeat(30);
  assert.deepEqual(secrets(`-----BEGIN ENCRYPTED PRIVATE KEY-----\n${corps}\n-----END ENCRYPTED PRIVATE KEY-----\n`, 'certs/app.txt', 'text'), []);
  assert.deepEqual(secrets(`-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,00\n\n${corps}\n-----END RSA PRIVATE KEY-----\n`, 'certs/app.txt', 'text'), []);
  assert.equal(secrets(`-----BEGIN RSA PRIVATE KEY-----\n${corps}\n-----END RSA PRIVATE KEY-----\n`, 'certs/app.txt', 'text').length, 1);
});

// ---------- 3. marquer le reste « pas un problème » ----------
const probleme = { id: 'secret:a.py', severity: 'high', locations: [{ file: 'a.py', line: 10 }, { file: 'b.py', line: 3 }] };
const marquer = (surcharge = {}) => [{ id: probleme.id, severity: 'high', locations: ['a.py:10', 'b.py:3'], ...surcharge }];

test('un rejet couvre le problème pour lequel il a été fait', () => {
  assert.ok(rejetPour(probleme, marquer()));
  assert.equal(rejetPour({ ...probleme, id: 'secret:other.py' }, marquer()), null);
  assert.equal(rejetPour(probleme, []), null);
  assert.equal(rejetPour(probleme, undefined), null);
});

test('une modification plus haut dans le fichier, qui ne fait que déplacer la ligne, ne le fait pas revenir', () => {
  assert.ok(rejetPour({ ...probleme, locations: [{ file: 'a.py', line: 42 }, { file: 'b.py', line: 3 }] }, marquer()));
});

test('il revient quand il y a du nouveau : un autre fichier, une autre découverte dans le fichier, ou un changement de gravité', () => {
  assert.equal(rejetPour({ ...probleme, locations: [...probleme.locations, { file: 'c.py', line: 1 }] }, marquer()), null);
  assert.equal(rejetPour({ ...probleme, locations: [...probleme.locations, { file: 'a.py', line: 99 }] }, marquer()), null);
  assert.equal(rejetPour({ ...probleme, severity: 'medium' }, marquer()), null);
  assert.ok(rejetPour({ ...probleme, locations: [probleme.locations[0]] }, marquer()), 'un emplacement qui disparaît n’est pas du nouveau');
});

test('le résumé laisse de côté les problèmes rejetés, mais ils restent listés', () => {
  const sante = { summary: { high: 2, medium: 0, low: 0 }, problemes: [probleme, { id: 'other', severity: 'high', locations: [] }] };
  const sortie = avecRejets(sante, marquer());
  assert.deepEqual(sortie.summary, { high: 1, medium: 0, low: 0 });
  assert.equal(sortie.problemes.length, 2);
  assert.equal(sortie.dismissed.length, 1);
  assert.deepEqual(avecRejets(sante, 'nonsense').summary, { high: 2, medium: 0, low: 0 });
});

test('la page applique la même règle que la construction', () => {
  const ui = fs.readFileSync(new URL('../skills/floorplan/assets/ui/20-health.js', import.meta.url), 'utf8');
  for (const morceau of [`d.severity && d.severity !== issue.severity`, `String(loc).replace(/:[^:]*$/, '')`, `left.get(l.file) || 0`]) assert.ok(ui.includes(morceau), morceau);
});

// ---------- par la construction et par le serveur ----------
let racine, serveur, base, jeton;
const NOTE = 'cette valeur n’est qu’un exemple, voir le wiki';
const donneesDe = (html) => JSON.parse(/<script>window\.FLOORPLAN = (.*?);<\/script>/s.exec(html)[1]);
const fichierCarte = (nom) => path.join(racine, 'floorplan', nom);
const appeler = (method, corps, headers = { 'x-floorplan-token': jeton }) => fetch(base + '/api/health/dismissed', { method, headers: { 'content-type': 'application/json', ...headers }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
const exporterPage = async (include) => (await fetch(base + '/api/export', { method: 'POST', headers: { 'content-type': 'application/json', 'x-floorplan-token': jeton }, body: JSON.stringify({ include }) })).text();

before(async () => {
  racine = shopApp();
  run('scan.mjs', racine);
  run('build.mjs', racine, '--no-claude-md');
  const port = 20000 + Math.floor(Math.random() * 20000);
  serveur = spawn(process.execPath, [fichierCarte('serve.mjs'), '--port', String(port), '--no-open'], {
    cwd: racine, env: { ...process.env, FLOORPLAN_CLAUDE: path.join(racine, 'no-such-cli'), FLOORPLAN_CODEX: path.join(racine, 'no-such-codex') },
  });
  base = await new Promise((resoudre, rejeter) => {
    let sortie = '';
    const minuteur = setTimeout(() => rejeter(new Error(`le serveur n’a pas démarré : ${sortie}`)), 20000);
    serveur.stdout.on('data', (d) => { sortie += d; const m = /Floorplan: (http:\/\/\S+)/.exec(sortie); if (m) { clearTimeout(minuteur); resoudre(m[1].replace(/\/$/, '')); } });
    serveur.on('exit', (code) => rejeter(new Error(`le serveur s’est arrêté (${code}) : ${sortie}`)));
  });
  jeton = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())[1];
});
after(async () => {
  if (serveur && serveur.exitCode === null) await new Promise((resoudre) => { serveur.once('exit', resoudre); serveur.kill(); });
  cleanup(racine);
});

test('enregistrer un rejet demande le jeton', async () => {
  assert.equal((await appeler('POST', { id: 'x', locations: [] }, { 'x-floorplan-token': 'wrong' })).status, 403);
  assert.ok(!fs.existsSync(fichierCarte('health-dismissed.json')));
  assert.equal((await appeler('POST', { locations: [] })).status, 400);
});

test('un rejet enregistré sur la carte survit à une reconstruction et sort des compteurs ; l’annuler les rétablit', async () => {
  const premier = readGraph(racine).sante;
  const cible = premier.problemes.find((i) => i.kind === 'secret');
  assert.ok(cible && premier.summary.high > 0);
  const enregistrement = { id: cible.id, severity: cible.severity, locations: cible.locations.map((l) => `${l.file}:${l.line}`), reason: NOTE };
  assert.equal((await (await appeler('POST', enregistrement)).json()).dismissed.length, 1);
  assert.equal((await (await appeler('POST', enregistrement)).json()).dismissed.length, 1, 'enregistrer deux fois le remplace');

  const affiche = run('build.mjs', racine, '--no-claude-md', '--artifact');
  const sante = readGraph(racine).sante;
  assert.equal(sante.summary.high, premier.summary.high - 1);
  assert.equal(sante.problemes.length, premier.problemes.length, 'il reste listé');
  assert.equal(sante.dismissed[0].reason, NOTE);
  assert.ok(!affiche.includes(`[high] ${cible.title}`), 'et le rapport de construction l’omet');

  // les raisons sont des notes pour soi : elles restent sur cet ordinateur
  assert.ok(!fs.readFileSync(fichierCarte('artifact.html'), 'utf8').includes(NOTE), 'absent de la copie pour l’appli Claude');
  const exporte = await exporterPage(['health']);
  assert.ok(!exporte.includes(NOTE), 'absent d’une copie exportée');
  assert.equal(donneesDe(exporte).sante.dismissed[0].id, cible.id, 'même si la copie met quand même le problème à part');
  assert.equal(donneesDe(await exporterPage([])).sante, undefined);

  assert.deepEqual((await (await appeler('DELETE', { id: cible.id })).json()).dismissed, []);
  run('build.mjs', racine, '--no-claude-md');
  assert.deepEqual(readGraph(racine).sante.summary, premier.summary);
  assert.equal(readGraph(racine).sante.dismissed, undefined);
});

test('un fichier de rejets cassé à la main avertit et ne casse pas la carte', () => {
  fs.writeFileSync(fichierCarte('health-dismissed.json'), '{ not json');
  assert.ok(run('build.mjs', racine, '--no-claude-md').includes('écrit'));
  assert.ok(readGraph(racine).sante.problemes.length > 0);
  fs.rmSync(fichierCarte('health-dismissed.json'));
});
