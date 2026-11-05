// Plans : une carte prévue à partir d’un cahier des charges (PRD) avant que le code existe. plan.mjs transforme la-carte/sources/plan.json
// en analyse, et construire.mjs la dessine comme une carte de code, avec une revue du plan à la place des contrôles du code.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DEPOT, creerProjet, executer, lireGraphe, lireJson, ecrireJson, clesRoutes, nettoyer } from './aides.mjs';

const EXEMPLE = path.join(DEPOT, 'tests', 'fixtures', 'blueprint');
let racine, graphe, sortiePlan, sortieConstruction;
before(() => {
  racine = creerProjet({});
  fs.cpSync(EXEMPLE, racine, { recursive: true });
  sortiePlan = executer('plan.mjs', racine);
  sortieConstruction = executer('construire.mjs', racine, '--no-claude-md');
  graphe = lireGraphe(racine);
});
after(() => nettoyer(racine));

/** Une copie de l’exemple dont plan.json est modifié, pour les cas d’erreur. */
function avecPlan(changement) {
  const r = creerProjet({});
  fs.cpSync(EXEMPLE, r, { recursive: true });
  const fichier = path.join(r, 'la-carte', 'sources', 'plan.json');
  const plan = lireJson(fichier);
  changement(plan);
  ecrireJson(fichier, plan);
  return r;
}
const echoue = (fonction) => { try { fonction(); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } assert.fail('le script devait échouer'); };

test('les fichiers et les adresses du serveur prévus sont sur la carte, nommés comme le plan les nomme', () => {
  assert.match(sortiePlan, /PLAN {2}21 fichiers prévus · 11 adresses du serveur · 9 appels vers des adresses prévues · 5 liens vers des services et des données/);
  assert.equal(graphe.files.length, 21);
  assert.equal(graphe.files.filter((f) => f.auto).length, 0, 'chaque fichier est décrit');
  assert.equal(graphe.routes.length, 11);
  assert.equal(graphe.files.find((f) => f.p === 'web/app/page.tsx').name, 'Home page');
  const reservation = graphe.routes.find((r) => r.m === 'POST' && r.p === '/api/bookings');
  assert.equal(reservation.name, 'Book a walk');
  assert.equal(reservation.access, 'signed-in');
  assert.deepEqual(graphe.meta.ebauche.stack.slice(0, 2), ['Next.js websites for owners and walkers', 'Node.js + Express server']);
  assert.equal(graphe.meta.ebauche.source, 'docs/prd.md');
  assert.match(sortieConstruction, /DESCRIPTIONS {2}fichiers 21\/21 · routes 11\/11/);
  assert.match(sortieConstruction, /PLAN {2}prévu, pas encore construit/);
});

test('les écrans appellent des adresses du serveur, et les fichiers atteignent les services extérieurs et la base de données', () => {
  const http = graphe.links.filter((l) => l.k === 'http' && l.labels?.length && l.a.startsWith('f:web/app/bookings')).map((l) => `${l.b.slice(2)} ${l.labels.join(', ')}`);
  assert.deepEqual(http, ['api/src/routes/bookings.ts GET /api/bookings, POST /api/bookings/:id/cancel']);
  const versNoeuds = graphe.links.filter((l) => l.b.startsWith('n:')).map((l) => `${l.a.slice(2)} ${l.k} ${l.b.slice(2)}`).sort();
  assert.deepEqual(versNoeuds, [
    'api/src/db/bookings.ts data db', 'api/src/db/users.ts data db', 'api/src/db/walkers.ts data db',
    'api/src/services/email.ts http postmark', 'api/src/services/payments.ts http stripe',
  ]);
});

test('la construction d’un plan indique que les fichiers sont prévus, avec les deux agents de code', async (t) => {
  for (const agent of ['codex', 'claude']) {
    await t.test(agent, () => {
      const r = creerProjet({});
      try {
        fs.cpSync(EXEMPLE, r, { recursive: true });
        executer('plan.mjs', r, '--agent', agent);
        const sortie = executer('construire.mjs', r, '--agent', agent, '--claude-md');
        assert.equal(lireGraphe(r).meta.agent, agent);
        assert.match(sortie, /PLAN {2}prévu, pas encore construit/);
        if (agent === 'codex') assert.match(sortie, /AGENT {2}Codex/);
        assert.doesNotMatch(sortie, /CLAUDE\.LOCAL\.MD/);
        assert.ok(!fs.existsSync(path.join(r, 'CLAUDE.local.md')), 'un plan n’ajoute pas de notes au projet');
      } finally { nettoyer(r); }
    });
  }
});

test('Écrans montre ce sur quoi chaque page prévue s’appuie, jusqu’à Stripe', () => {
  assert.deepEqual(graphe.ecrans.map((s) => s.url).sort(), ['/', '/book/:walkerId', '/bookings', '/login', '/schedule']);
  const reservation = graphe.ecrans.find((s) => s.url === '/book/:walkerId');
  const derriere = reservation.behind.map((b) => `${b.kind} ${b.id}`);
  assert.ok(derriere.includes('server f:api/src/routes/bookings.ts'));
  assert.ok(derriere.includes('outside n:stripe'));
});

test('la Santé est une revue du plan', () => {
  const problemes = graphe.sante.problemes;
  const titres = problemes.map((i) => `${i.severity} ${i.title}`);
  assert.deepEqual(titres, [
    'medium N’importe qui pourrait modifier des données par une adresse du serveur prévue',
    'medium Le plan ne dit pas qui peut utiliser une adresse du serveur',
    'medium Can owners cancel a walk for free, and up to when?',
    'low Rien dans le plan n’utilise une adresse du serveur',
    'low Un fichier prévu n’est relié à rien',
  ]);
  const routesDe = (i) => i.items.filter((id) => id.startsWith('r:')).map((id) => `${graphe.routes[+id.slice(2)].m} ${graphe.routes[+id.slice(2)].p}`).sort();
  // la connexion est ouverte exprès (publicBecause dit pourquoi), donc seule l’inscription est signalée
  assert.deepEqual(routesDe(problemes[0]), ['POST /api/auth/signup']);
  assert.deepEqual(routesDe(problemes[1]), ['DELETE /api/walkers/:id']);
  assert.deepEqual(problemes[2].items.sort(), ['f:web/app/bookings/page.tsx', `r:${graphe.routes.findIndex((r) => r.p === '/api/bookings/:id/cancel')}`].sort());
  assert.deepEqual(routesDe(problemes[3]), ['DELETE /api/walkers/:id']);
  assert.deepEqual(problemes[4].items, ['f:api/src/lib/geo.ts']);
  assert.match(problemes[0].fix, /la-carte\/sources\/plan\.json/);
  // chaque élément a aussi une demande pour le régler depuis la carte, que la personne peut compléter ou modifier
  assert.deepEqual(problemes.map((i) => i.change), [
    'Passe en revue qui peut utiliser POST /api/auth/signup : n’importe qui peut actuellement modifier des données par ce biais. ',
    'Décide qui peut utiliser DELETE /api/walkers/:id, d’après le cahier des charges (PRD). ',
    'Question ouverte : « Can owners cancel a walk for free, and up to when? » Ma réponse : ',
    'Rien n’appelle DELETE /api/walkers/:id. Ajoute l’écran ou le service qui doit s’en servir, ou retire-la si ce n’est pas utile. ',
    'api/src/lib/geo.ts n’est relié à rien. Relie-le à ce qui doit s’en servir, ou retire-le. ',
  ]);
  assert.match(sortieConstruction, /REVUE DU PLAN {2}0 important\(s\) · 3 à corriger · 2 mineur\(s\)/);
});

test('la page de la carte la marque comme un plan, et Demander sait qu’il n’y a pas de code à lire', () => {
  const html = fs.readFileSync(path.join(racine, 'la-carte', 'index.html'), 'utf8');
  assert.ok(html.includes('/* ui/06-plan.js */'));
  assert.ok(html.includes('"ebauche":{"source":"docs/prd.md"'));
  const requete = fs.readFileSync(path.join(racine, 'la-carte', '.cache', 'requete.mjs'), 'utf8');
  assert.ok(requete.includes('Cette carte est un plan'));
  assert.ok(!fs.existsSync(path.join(racine, 'CLAUDE.local.md')));
});

test('une adresse du serveur dit quelles personnes connectées peuvent l’utiliser', () => {
  const r = graphe.routes.find((x) => x.p === '/api/walker/schedule');
  assert.equal(r.access, 'signed-in');
  assert.equal(r.who, 'walkers');
  assert.match(graphe.routes.find((x) => x.p === '/api/auth/login').publicBecause, /sign in before they are signed in/);
});

test('un projet qui ne contient que plan.json peut être planifié avant que architecture.json existe', () => {
  const r = creerProjet({ 'PRD.md': '# A plan' });
  try {
    fs.mkdirSync(path.join(r, 'la-carte', 'sources'), { recursive: true });
    fs.copyFileSync(path.join(EXEMPLE, 'la-carte', 'sources', 'plan.json'), path.join(r, 'la-carte', 'sources', 'plan.json'));
    assert.match(executer('etat.mjs', r), /un plan a été commencé \(sources\/plan\.json\) mais jamais dessiné/);
    assert.match(executer('plan.mjs', r), /lance construire\.mjs une fois la-carte\/sources\/architecture\.json écrit/);
  } finally { nettoyer(r); }
});

test('plan.mjs nomme ce qui ne va pas dans un plan', () => {
  const r = avecPlan((p) => {
    p.files[0].uses.push('web/components/WalkerCrad.tsx');
    p.endpoints[0].access = 'everyone';
    p.endpoints[1].file = 'api/src/routes/walker.ts';
    p.files[1].calls.push('POST /api/payments');
    p.files[2].calls.push('cancel it');
    p.endpoints[2].access = 'staff';
    p.files.find((f) => f.services).services = ['strpe'];
  });
  try {
    const sortie = echoue(() => executer('plan.mjs', r));
    assert.match(sortie, /files "web\/app\/page\.tsx"\.uses "web\/components\/WalkerCrad\.tsx" n’est pas un des fichiers prévus/);
    assert.match(sortie, /access "everyone" doit être l’une de : public, signed-in, team, webhook, internal/);
    assert.match(sortie, /\.file "api\/src\/routes\/walker\.ts" n’est pas un des fichiers prévus/);
    assert.match(sortie, /calls "cancel it" doit ressembler à "POST \/api\/orders"/);
    assert.match(sortie, /calls "POST \/api\/payments" ne correspond à aucune adresse du serveur prévue/);
    assert.match(sortie, /access "staff" doit être l’une de .* \("team" désigne ta propre équipe ; pour une partie des utilisateurs de l’app, utilise "signed-in" avec "who"\)/);
    assert.match(sortie, /services "strpe" n’est pas un identifiant de partie dans sources\/architecture\.json \(tu voulais dire "stripe" \?\)/);
  } finally { nettoyer(r); }
});

test('construire.mjs repère un service qui n’est pas une partie', () => {
  const r = avecPlan((p) => { p.files.find((f) => f.services).services = ['strpe']; });
  try {
    // plan.mjs le contrôle quand architecture.json existe ; sans lui, c’est la construction qui sert de filet
    const archi = path.join(r, 'la-carte', 'sources', 'architecture.json'), sauvegarde = fs.readFileSync(archi);
    fs.rmSync(archi);
    executer('plan.mjs', r);
    fs.writeFileSync(archi, sauvegarde);
    const sortie = echoue(() => executer('construire.mjs', r, '--no-claude-md'));
    assert.match(sortie, /erreur\(s\) dans la-carte.sources.architecture\.json ou sources\/plan\.json/);
    assert.match(sortie, /nomme "strpe" dans ses services, qui n’est pas un identifiant de partie dans architecture\.json — tu voulais dire "stripe" \?/);
  } finally { nettoyer(r); }
});

test('refresh redessine un plan d’après plan.json, et --from-code cartographie le vrai code à la place', () => {
  const r = avecPlan(() => {});
  try {
    executer('plan.mjs', r);
    executer('construire.mjs', r, '--no-claude-md');
    assert.match(executer('etat.mjs', r), /un plan \(prévu, pas encore construit, d’après docs\/prd\.md\)/);
    const plan = lireJson(path.join(r, 'la-carte', 'sources', 'plan.json'));
    plan.endpoints.push({ method: 'GET', path: '/api/health', file: 'api/src/server.ts', name: 'Health check', access: 'public' });
    ecrireJson(path.join(r, 'la-carte', 'sources', 'plan.json'), plan);
    assert.match(executer('actualiser.mjs', r, '--no-claude-md'), /redessiné d’après la-carte\/sources\/plan\.json/);
    assert.ok(clesRoutes(lireGraphe(r)).includes('GET /api/health'));

    fs.mkdirSync(path.join(r, 'api', 'src'), { recursive: true });
    fs.writeFileSync(path.join(r, 'api', 'src', 'server.ts'), `import express from 'express';\nconst app = express();\napp.get('/api/health', (req, res) => res.send('ok'));\napp.listen(3000);\n`);
    // les parcours du plan pointent vers des fichiers pas encore écrits : la carte du code a donc les siens
    ecrireJson(path.join(r, 'la-carte', 'sources', 'architecture.json'), { projet: { name: 'Pawprint', summary: 'Being built.' }, nodes: [{ id: 'api', label: 'Main server', kind: 'service', summary: 'The server.', paths: ['api/**'] }] });
    executer('actualiser.mjs', r, '--from-code', '--no-claude-md');
    const g = lireGraphe(r);
    assert.equal(g.meta.ebauche, undefined);
    assert.deepEqual(clesRoutes(g), ['GET /api/health']);
    assert.ok(fs.existsSync(path.join(r, 'la-carte', 'sources', 'plan.json')), 'le plan est conservé');
  } finally { nettoyer(r); }
});
