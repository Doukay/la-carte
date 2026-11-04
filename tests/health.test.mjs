// Tests de non-régression du contrôle de santé : construire la carte d’un petit projet d’exemple et vérifier quelles adresses du serveur
// Santé signale comme ouvertes à tout le monde. À lancer avec : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(ici, '..', 'skills', 'floorplan', 'scripts');

/** Copie un projet d’exemple dans un dossier temporaire, le cartographie comme une seule partie, et rend le graphe construit. */
function construireExemple(nom) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), `floorplan-${nom}-`));
  fs.cpSync(path.join(ici, 'fixtures', nom), racine, { recursive: true });
  fs.mkdirSync(path.join(racine, 'floorplan'));
  fs.writeFileSync(path.join(racine, 'floorplan', 'architecture.json'), JSON.stringify({
    projet: { name: nom, summary: 'Test fixture.' },
    nodes: [{ id: 'api', label: 'Server', kind: 'service', summary: 'The sample server.', paths: ['**'] }],
  }));
  for (const s of ['scan.mjs', 'build.mjs']) execFileSync(process.execPath, [path.join(scripts, s), racine, '--no-claude-md'], { stdio: 'pipe' });
  const graphe = JSON.parse(fs.readFileSync(path.join(racine, 'floorplan', 'graph.json'), 'utf8'));
  fs.rmSync(racine, { recursive: true, force: true });
  return graphe;
}

/** « MÉTHODE /chemin » pour chaque adresse du serveur que Santé signale comme appelable par tout le monde. */
function adressesOuvertes(graphe) {
  return graphe.sante.problemes
    .filter((i) => i.kind === 'unprotected-endpoint')
    .flatMap((i) => i.items.filter((id) => id.startsWith('r:')).map((id) => graphe.routes[+id.slice(2)]))
    .map((r) => `${r.m} ${r.p}`)
    .sort();
}

test('FastAPI : les alias de dépendance Annotated comptent comme des contrôles de connexion (#4)', () => {
  const graphe = construireExemple('fastapi-annotated');
  assert.ok(graphe.routes.length >= 7, `les 7 adresses de l’exemple étaient attendues, ${graphe.routes.length} trouvées`);
  // alias importé (AdminUser), alias du même fichier (MemberUser), alias dont la dépendance prend
  // AdminUser (OwnedOffice) et alias dont le nom se lit déjà comme un contrôle (AdminAccess) sont tous protégés ;
  // les routes avec seulement une session de base de données (SessionDep, SqlSessionDep sur get_sql_session) ne le sont pas
  assert.deepEqual(adressesOuvertes(graphe), ['POST /comments', 'POST /feedback']);
});

test('FastAPI : les adresses publiques readiness et liveness ne sont pas des alertes de sécurité (#7)', () => {
  const graphe = construireExemple('fastapi-annotated');
  const chemins = graphe.routes.map((r) => r.p);
  assert.ok(chemins.includes('/readyz'));
  assert.ok(chemins.includes('/livez'));
  assert.ok(!adressesOuvertes(graphe).includes('GET /readyz'));
  assert.ok(!adressesOuvertes(graphe).includes('GET /livez'));
});

test('FastAPI : une dépendance nommée « guard » n’est pas une adresse publique (#7)', () => {
  const graphe = construireExemple('fastapi-guard-name');
  assert.deepEqual(adressesOuvertes(graphe), ['POST /billing/open']);
});

test('FastAPI : les jetons d’en-tête ne sont protégés que si la fonction les valide (#7)', () => {
  const graphe = construireExemple('fastapi-header-guard');
  assert.ok(graphe.routes.some((r) => r.p === '/invites/checked'));
  assert.deepEqual(adressesOuvertes(graphe), ['POST /invites/unchecked']);
});

test('FastAPI : un validateur de signature dans une fonction importée protège la route (#7)', () => {
  const graphe = construireExemple('fastapi-signature-helper');
  assert.ok(graphe.routes.some((r) => r.p === '/webhook/verified'));
  assert.deepEqual(adressesOuvertes(graphe), ['POST /webhook/unverified']);
});

test('FastAPI : les contrôles ajoutés là où un routeur est inclus comptent comme des contrôles de connexion', () => {
  const graphe = construireExemple('fastapi-include-router');
  assert.equal(graphe.routes.length, 4, `les 4 adresses de l’exemple étaient attendues, ${graphe.routes.length} trouvées`);
  // le routeur importé sous un autre nom (item_routes) reçoit quand même son préfixe
  assert.ok(graphe.routes.some((r) => r.p === '/items/{item_id}'), '/items/{item_id} attendu');
  // app.include_router(staff.router, dependencies=[Depends(require_admin)]) protège chaque route staff,
  // même avec un paquet aussi appelé staff importé avant ; de même un contrôle à côté d’une session de base de données,
  // sur plusieurs lignes ; une session de base de données seule (orders) ne protège rien
  assert.deepEqual(adressesOuvertes(graphe), ['POST /orders']);
});

test('Express : un contrôle avant une fonction nommée compte, et chaque route est jugée sur ses propres arguments', () => {
  const graphe = construireExemple('express-named-handlers');
  assert.equal(graphe.routes.length, 5, `les 5 adresses de l’exemple étaient attendues, ${graphe.routes.length} trouvées`);
  // router.post('/books', requireAuth, createBook) est protégée ; une fonction nommée comme un contrôle
  // (updateUser) n’est pas un contrôle, et un contrôle sur la route suivante ne protège pas celle d’avant
  assert.deepEqual(adressesOuvertes(graphe), ['GET /api/books', 'POST /api/notes', 'PUT /api/users/:id']);
});
