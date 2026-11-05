// Contrôles de Santé pour les erreurs habituelles des applis construites sur Supabase, Firebase, Stripe, Next.js et Vite :
// tables sans sécurité au niveau des lignes, règles Firebase qui laissent entrer n’importe qui, webhooks Stripe qui ne
// vérifient pas la signature, clés secrètes dans des variables que reçoit le navigateur, et CORS qui autorise tous les sites.
// Chaque contrôle a des cas qu’il doit trouver et des sosies qu’il doit laisser tranquilles (une fausse alerte coûte plus cher
// qu’un oubli). Les valeurs qui ressemblent à des secrets sont assemblées à l’exécution pour qu’aucune ne soit jamais enregistrée dans ce dépôt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, creerProjet, analyserEtConstruire, lireGraphe, nettoyer, adressesOuvertes } from './aides.mjs';

const { trouverProblemes, variablePubliqueFuyante } = await lib('sante.mjs');
const trouver = (source, fichier, langage, k) => trouverProblemes(source, { path: fichier, category: 'code', lang: langage }).filter((x) => x.k === k);
const FAUSSE_CLE_OPENAI = ['sk', 'proj', 'Zq8x', 'T3Bl', 'bkFJ', 'k2m9', 'Wv4r', 'Lp7d', 'Hs1n'].join('');
const ANNEE_SUIVANTE = new Date().getUTCFullYear() + 1;

// ---------- clés secrètes dans des variables que reçoit le navigateur ----------

test('les variables publiques nommées comme des clés secrètes sont reconnues, et les clés publiques par conception ne le sont pas', () => {
  assert.equal(variablePubliqueFuyante('VITE_OPENAI_API_KEY'), 'OpenAI');
  assert.equal(variablePubliqueFuyante('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'), 'Supabase');
  assert.equal(variablePubliqueFuyante('NEXT_PUBLIC_STRIPE_SECRET_KEY'), 'Stripe');
  assert.equal(variablePubliqueFuyante('REACT_APP_ANTHROPIC_KEY'), 'Anthropic');
  assert.equal(variablePubliqueFuyante('NEXT_PUBLIC_DATABASE_URL'), '');
  for (const bonne of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'VITE_FIREBASE_API_KEY',
    'VITE_GOOGLE_MAPS_API_KEY', 'NEXT_PUBLIC_GITHUB_CLIENT_ID', 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'NEXT_PUBLIC_API_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY']) {
    assert.equal(variablePubliqueFuyante(bonne), null, bonne);
  }
});

test('le code qui lit un secret dans une variable publique est trouvé, quelle que soit la façon dont le framework les lit', () => {
  assert.deepEqual(trouver(`const key = import.meta.env.VITE_OPENAI_API_KEY;\n`, 'src/chat.ts', 'typescript', 'public-env').map((x) => [x.name, x.line]), [['VITE_OPENAI_API_KEY', 1]]);
  assert.equal(trouver(`fetch(u, { headers: { Authorization: process.env['NEXT_PUBLIC_STRIPE_SECRET_KEY'] } })`, 'app/page.tsx', 'typescript', 'public-env').length, 1);
  assert.equal(trouver(`import { PUBLIC_OPENAI_KEY } from '$env/static/public';`, 'src/routes/+page.svelte', 'svelte', 'public-env').length, 1);
  // PUBLIC_ ne veut rien dire pour Node, la clé anon est publique par conception, et les tests sont laissés tranquilles
  assert.deepEqual(trouver(`const k = process.env.PUBLIC_OPENAI_KEY;`, 'server.js', 'javascript', 'public-env'), []);
  assert.deepEqual(trouver(`createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY)`, 'src/db.ts', 'typescript', 'public-env'), []);
  assert.deepEqual(trouver(`const key = import.meta.env.VITE_OPENAI_API_KEY;`, 'src/chat.test.ts', 'typescript', 'public-env'), []);
});

// ---------- webhooks Stripe ----------

test('le code qui agit sur des événements de paiement Stripe sans vérifier la signature est trouvé', () => {
  const js = [
    `import Stripe from 'stripe';`,
    `export async function POST(req) {`,
    `  const event = await req.json();`,
    `  switch (event.type) {`,
    `    case 'checkout.session.completed': await markPaid(event.data.object); break;`,
    `    case 'customer.subscription.deleted': await cancel(event.data.object); break;`,
    `  }`,
    `}`,
  ].join('\n');
  const [resultat] = trouver(js, 'app/api/webhooks/stripe/route.ts', 'typescript', 'stripe-unsigned');
  assert.equal(resultat.line, 5);
  assert.deepEqual(resultat.events, ['checkout.session.completed', 'customer.subscription.deleted']);
  const py = `import stripe\n@app.post("/stripe")\nasync def hook(request):\n    event = await request.json()\n    if event["type"] == "invoice.paid":\n        grant_credits(event)\n`;
  assert.equal(trouver(py, 'api/billing.py', 'python', 'stripe-unsigned').length, 1);
});

test('les webhooks Stripe vérifiés, et le code qui ne fait que lancer un paiement, sont laissés tranquilles', () => {
  const verifie = `const event = stripe.webhooks.constructEvent(body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);\nif (event.type === 'checkout.session.completed') fulfil(event);`;
  assert.deepEqual(trouver(verifie, 'server/stripe.js', 'javascript', 'stripe-unsigned'), []);
  const py = `event = stripe.Webhook.construct_event(payload, sig, secret)\nif event["type"] == "invoice.paid":\n    pay()`;
  assert.deepEqual(trouver(py, 'billing.py', 'python', 'stripe-unsigned'), []);
  // lister les événements auxquels s’abonner, ce n’est pas les traiter
  const preparation = `await stripe.webhookEndpoints.create({ url, enabled_events: ['checkout.session.completed'] });`;
  assert.deepEqual(trouver(preparation, 'scripts/setup-stripe.js', 'javascript', 'stripe-unsigned'), []);
});

// ---------- CORS ----------

test('un CORS qui autorise tous les sites est trouvé, et jugé grave seulement quand les cookies de connexion suivent', () => {
  const cors = (source, fichier = 'server.js', langage = 'javascript') => trouver(source, fichier, langage, 'cors-any').map((x) => x.credentials);
  assert.deepEqual(cors(`import cors from 'cors';\napp.use(cors());`), [false]);
  assert.deepEqual(cors(`const cors = require('cors');\napp.use(cors({ origin: true, credentials: true }));`), [true]);
  // les navigateurs refusent "*" avec des cookies, donc cette paire n’est pas la dangereuse
  assert.deepEqual(cors(`import cors from 'cors';\napp.use(cors({ origin: '*', credentials: true }));`), [false]);
  assert.deepEqual(cors(`res.setHeader('Access-Control-Allow-Origin', req.headers.origin);\nres.setHeader('Access-Control-Allow-Credentials', 'true');`), [true]);
  assert.deepEqual(cors(`app.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_credentials=True,\n)`, 'main.py', 'python'), [true]);
  assert.deepEqual(cors(`CORS(app)`, 'app.py', 'python'), [false]);
  assert.deepEqual(cors(`CORS_ALLOW_ALL_ORIGINS = True\nCORS_ALLOW_CREDENTIALS = True`, 'mysite/settings.py', 'python'), [true]);
});

test('un CORS limité à des sites nommés est laissé tranquille', () => {
  const aucun = (source, fichier = 'server.js', langage = 'javascript') => assert.deepEqual(trouver(source, fichier, langage, 'cors-any'), [], source);
  aucun(`import cors from 'cors';\napp.use(cors({ origin: ['https://myapp.com'], credentials: true }));`);
  aucun(`import cors from 'cors';\napp.use(cors({ origin: process.env.ALLOWED_ORIGINS.split(',') }));`);
  aucun(`app.add_middleware(CORSMiddleware, allow_origins=["https://myapp.com"], allow_credentials=True)`, 'main.py', 'python');
  aucun(`CORS(app, origins=["https://myapp.com"], supports_credentials=True)`, 'app.py', 'python');
  aucun(`CORS(app, resources={r"/api/*": {"origins": "https://myapp.com"}})`, 'app.py', 'python');
});

// ---------- migrations Supabase ----------

test('migrations : tables, sécurité au niveau des lignes activée et désactivée, renommages, suppressions et règles ouvertes sont lus dans l’ordre', () => {
  const sql = [
    `create table public.profiles (id uuid primary key);`,
    `-- alter table public.profiles disable row level security;`,
    `alter table public.profiles enable row level security;`,
    `create table if not exists "notes" (id bigint);`,
    `create temp table scratch (id int);`,
    `alter table notes rename to posts;`,
    `drop table if exists old_stuff;`,
    `create policy "Anyone can join" on public.waitlist for insert to anon with check (true);`,
    `create policy "Owners read" on public.profiles for select using (auth.uid() = id);`,
    `create policy "Anyone reads" on public.posts for select using (true);`,
  ].join('\n');
  const obtenu = trouverProblemes(sql, { path: 'supabase/migrations/1_init.sql', category: 'code', lang: 'sql' }).map(({ k, table, on, to, line, cmd }) => [k, table, on ?? to ?? cmd ?? null, line]);
  assert.deepEqual(obtenu, [
    ['sql-table', 'public.profiles', null, 1],
    ['sql-rls', 'public.profiles', true, 3],
    ['sql-table', 'public.notes', null, 4],
    ['sql-rename', 'public.notes', 'public.posts', 6],
    ['sql-drop', 'public.old_stuff', null, 7],
    ['sql-open-policy', 'public.waitlist', 'insert', 8],
  ]);
});

// ---------- une appli entière ----------

const reglesFutures = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.time < timestamp.date(${ANNEE_SUIVANTE}, 3, 1);\n    }\n  }\n}\n`;

/** Une appli Vite + Supabase avec une erreur de chaque sorte, à côté d’un webhook Stripe de style Next.js et d’un serveur Express. */
function appARisques() {
  return creerProjet({
    'package.json': JSON.stringify({ name: 'vibe', dependencies: { '@supabase/supabase-js': '^2.45.0', stripe: '^16.0.0', express: '^4.19.0', cors: '^2.8.5' } }),
    'src/db.ts': `import { createClient } from '@supabase/supabase-js';\nexport const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);\n`,
    'src/chat.ts': `export async function ask(q: string) {\n  return fetch('https://api.openai.com/v1/chat/completions', { headers: { Authorization: 'Bearer ' + import.meta.env.VITE_OPENAI_API_KEY } });\n}\n`,
    '.env.local': `VITE_SUPABASE_URL=https://abcd.supabase.co\nVITE_OPENAI_API_KEY=${FAUSSE_CLE_OPENAI}\n`,
    'supabase/migrations/20250101000000_init.sql': [
      `create table public.profiles (id uuid primary key references auth.users, name text);`,
      `create table public.notes (id bigint generated always as identity primary key, user_id uuid, body text);`,
      `create table public.old_stuff (id int);`,
      `create table public.waitlist (email text primary key);`,
      `alter table public.waitlist enable row level security;`,
      `create policy "Anyone can join" on public.waitlist for insert to anon with check (true);`,
    ].join('\n'),
    'supabase/migrations/20250201000000_lock_profiles.sql': `alter table public.profiles enable row level security;\ndrop table public.old_stuff;\n`,
    'firestore.rules': reglesFutures,
    'storage.rules': `rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /{allPaths=**} {\n      allow read, write;\n    }\n  }\n}\n`,
    'database.rules.json': `{\n  "rules": {\n    ".read": true,\n    ".write": "auth != null"\n  }\n}\n`,
    'app/api/webhooks/stripe/route.ts': `import Stripe from 'stripe';\nexport async function POST(req: Request) {\n  const event = await req.json();\n  if (event.type === 'checkout.session.completed') await fulfil(event.data.object);\n  return new Response('ok');\n}\nasync function fulfil(s: unknown) {}\n`,
    'server/index.js': `import express from 'express';\nimport cors from 'cors';\nconst app = express();\napp.use(cors({ origin: true, credentials: true }));\napp.listen(3001);\n`,
  }, { arch: { projet: { name: 'Vibe', summary: 'A sample app.' }, nodes: [{ id: 'app', label: 'App', kind: 'ui', summary: 'The app.', paths: ['**'] }] } });
}

test('une appli entière : chaque erreur devient un problème en langage simple avec un correctif à coller', () => {
  const racine = appARisques();
  try {
    analyserEtConstruire(racine);
    const graphe = lireGraphe(racine);
    const problemes = graphe.sante.problemes;
    const parId = (prefixe) => problemes.filter((i) => i.id.startsWith(prefixe));

    // Supabase : seule notes est ouverte (profiles a été verrouillée ensuite, old_stuff a été supprimée, waitlist a la RLS)
    const [rls] = parId('rls:');
    assert.equal(rls.severity, 'high');
    assert.equal(rls.title, 'N’importe qui peut lire et modifier ta table notes');
    assert.deepEqual(rls.locations, [{ file: 'supabase/migrations/20250101000000_init.sql', line: 2 }]);
    assert.match(rls.fix, /alter table <table> enable row level security/);
    // la règle d’insertion ouverte de waitlist mérite un coup d’œil, pas une alarme
    const [politique] = parId('open-policy:');
    assert.equal(politique.severity, 'medium');
    assert.match(politique.detail, /formulaire public/);

    // Firebase : mode test avec sa date, stockage ouvert, et base de données lisible par tous
    const fb = Object.fromEntries(parId('firebase-rules:').map((i) => [i.id.split(':')[1], i]));
    assert.equal(fb['firestore.rules'].severity, 'high');
    assert.match(fb['firestore.rules'].title, new RegExp(`ouvert à tout le monde jusqu’au 1 mars ${ANNEE_SUIVANTE}`));
    assert.match(fb['firestore.rules'].fix, /firebase deploy --only firestore:rules/);
    assert.equal(fb['storage.rules'].severity, 'high');
    assert.equal(fb['storage.rules'].title, 'N’importe qui peut envoyer, remplacer ou supprimer tes fichiers Firebase');
    assert.equal(fb['database.rules.json'].severity, 'medium');
    assert.equal(fb['database.rules.json'].title, 'N’importe qui peut tout lire dans ton Firebase Realtime Database');

    // Stripe : un problème précis, et le même webhook n’est pas aussi signalé comme adresse du serveur ouverte
    const [stripe] = parId('stripe-webhook:');
    assert.equal(stripe.severity, 'high');
    assert.match(stripe.title, /simuler un paiement Stripe/);
    assert.match(stripe.fix, /await req\.text\(\)/);
    assert.ok(!adressesOuvertes(graphe).includes('POST /api/webhooks/stripe'), adressesOuvertes(graphe).join(', '));

    // la clé OpenAI dans une variable VITE_ : définie dans .env.local et lue par le code du navigateur
    const [pub] = parId('public-env');
    assert.equal(pub.severity, 'high');
    assert.equal(pub.title, 'VITE_OPENAI_API_KEY est envoyé au navigateur de chaque visiteur');
    assert.deepEqual(pub.locations.map((l) => l.file).sort(), ['.env.local', 'src/chat.ts']);

    // CORS qui renvoie n’importe quelle origine avec des cookies
    const [cors] = parId('cors');
    assert.equal(cors.severity, 'medium');
    assert.equal(cors.title, 'N’importe quel site web pourrait agir à la place de tes utilisateurs connectés');

    // les problèmes importants viennent en premier, et aucune valeur de clé n’arrive dans ce que la carte écrit
    assert.equal(problemes[0].severity, 'high');
    for (const f of fs.readdirSync(path.join(racine, 'la-carte'), { recursive: true })) {
      const p = path.join(racine, 'la-carte', f);
      if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p, 'utf8').includes(FAUSSE_CLE_OPENAI.slice(4)), `${f} contient la clé`);
    }
  } finally { nettoyer(racine); }
});

test('la même appli bien faite ne soulève aucun de ces problèmes', () => {
  const racine = creerProjet({
    'package.json': JSON.stringify({ name: 'tidy', dependencies: { '@supabase/supabase-js': '^2.45.0', stripe: '^16.0.0', cors: '^2.8.5' } }),
    'src/db.ts': `import { createClient } from '@supabase/supabase-js';\nexport const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);\n`,
    'supabase/migrations/20250101000000_init.sql': `create table public.notes (id bigint primary key, user_id uuid);\nalter table public.notes enable row level security;\ncreate policy "Own notes" on public.notes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);\n`,
    'firestore.rules': `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n    match /products/{id} {\n      allow read: if true;\n    }\n  }\n}\n`,
    'app/api/webhooks/stripe/route.ts': `import Stripe from 'stripe';\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\nexport async function POST(req: Request) {\n  const event = stripe.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature')!, process.env.STRIPE_WEBHOOK_SECRET!);\n  if (event.type === 'checkout.session.completed') await fulfil(event.data.object);\n  return new Response('ok');\n}\nasync function fulfil(s: unknown) {}\n`,
    'server/index.js': `import express from 'express';\nimport cors from 'cors';\nconst app = express();\napp.use(cors({ origin: ['https://tidy.app'], credentials: true }));\napp.listen(3001);\n`,
  }, { arch: { projet: { name: 'Tidy', summary: 'A sample app.' }, nodes: [{ id: 'app', label: 'App', kind: 'ui', summary: 'The app.', paths: ['**'] }] } });
  try {
    analyserEtConstruire(racine);
    const genres = lireGraphe(racine).sante.problemes.map((i) => i.kind);
    for (const k of ['database-rules', 'stripe-webhook', 'public-env-secret', 'cors']) assert.ok(!genres.includes(k), `${k} inattendu : ${genres.join(', ')}`);
  } finally { nettoyer(racine); }
});

test('les migrations Postgres simples sans Supabase ne sont pas soumises aux règles de Supabase, et le mode test expiré est signalé', () => {
  const racine = creerProjet({
    'db/schema.sql': `create table users (id serial primary key, email text);\n`,
    'firestore.rules': `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if request.time < timestamp.date(2020, 1, 1);\n    }\n  }\n}\n`,
  }, { arch: { projet: { name: 'Plain', summary: 'A sample app.' }, nodes: [{ id: 'app', label: 'App', kind: 'service', summary: 'The app.', paths: ['**'] }] } });
  try {
    analyserEtConstruire(racine);
    const problemes = lireGraphe(racine).sante.problemes;
    assert.ok(!problemes.some((i) => i.id.startsWith('rls:')), 'aucun problème de sécurité au niveau des lignes sans Supabase');
    const [fb] = problemes.filter((i) => i.id === 'firebase-rules:firestore.rules');
    assert.equal(fb.severity, 'medium');
    assert.equal(fb.title, 'Les règles en mode test de ton Firebase Firestore ont expiré le 1 janvier 2020');
  } finally { nettoyer(racine); }
});
