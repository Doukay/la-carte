// Fausses alertes signalées depuis la fenêtre « Pas un problème » de l’onglet Santé (#40-#52). La plupart venaient d’un seul site :
// des flux, des fiches d’information et des fichiers écrits pour les moteurs de recherche et les outils d’IA, l’API propre d’un CMS, la réponse « POST seulement »
// d’un webhook. Chaque cas vient avec son contre-exemple, car un contrôle qui se tait devant de vrais problèmes est pire qu’un contrôle bavard.
// Les valeurs qui ressemblent à des secrets sont assemblées à l’exécution pour qu’aucune ne soit jamais enregistrée dans ce dépôt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib, makeProject, scanAndBuild, readGraph, openEndpoints, cleanup } from './helpers.mjs';

const { trouverProblemes } = await lib('health.mjs');
const ARCH = { projet: { name: 'Site', summary: 'A sample site.' }, nodes: [{ id: 'site', label: 'Site', kind: 'service', summary: 'The site.', paths: ['**'] }] };
const fichierRoute = (path) => `src/app/${path}/route.ts`;
const JSON_STATIQUE = `export async function GET() { return Response.json({ name: 'Sample', plans: ['free', 'pro'] }); }\n`;
// une adresse du serveur protégée, pour que ces tests regardent les problèmes fichier par fichier plutôt que « rien ici ne contrôle les connexions »
const PROTEGE = {
  'package.json': '{"name":"site","dependencies":{"next":"15"}}',
  'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
  [fichierRoute('api/account')]: `import { getServerSession } from 'next-auth';\nexport async function GET() { const s = await getServerSession(); return Response.json(s); }\n`,
};

/** Cartographie un petit projet Next.js et rend le graphe. */
function construire(fichiers) {
  const racine = makeProject({ ...PROTEGE, ...fichiers }, { arch: ARCH });
  try { scanAndBuild(racine); return readGraph(racine); } finally { cleanup(racine); }
}
const ouvertes = (fichiers) => openEndpoints(construire(fichiers));

// ---------- flux et fichiers faits pour être lus par tout le monde (#41, #49) ----------
test('les flux et fichiers pour les robots d’indexation et les outils d’IA sont publics de par leur adresse', () => {
  const adresses = ['blog/rss.xml', 'blog/atom.xml', 'blog/feed.xml', 'rss', 'v1/llms.txt', 'llms-full.txt', 'ads.txt', 'humans.txt'];
  const trouvees = ouvertes(Object.fromEntries(adresses.map((a) => [fichierRoute(a), `import { posts } from '@/lib/db';\nexport async function GET() { return new Response(await posts()); }\n`])));
  assert.deepEqual(trouvees, []);
});

test('cette adresse n’excuse que la lecture, et un « fil » de réseau social n’est pas un fichier public', () => {
  const lectureBase = `import { db } from '@/lib/db';\nexport async function GET() { return Response.json(await db.post.findMany()); }\n`;
  assert.deepEqual(ouvertes({ [fichierRoute('api/feed')]: lectureBase }), ['GET /api/feed']);
  assert.deepEqual(ouvertes({ [fichierRoute('blog/rss.xml')]: `export async function POST(req: Request) { return Response.json(await req.json()); }\n` }), ['POST /blog/rss.xml']);
});

// ---------- le projet dit lui-même que c’est public (#44, #47, #48, #51, #52) ----------
const fluxDonnees = `import { db } from '@/lib/db';\nexport async function GET() { return Response.json(await db.plan.findMany()); }\n`;

test('une adresse du serveur que le projet liste dans son llms.txt ou autorise dans son robots.txt est publique exprès', () => {
  const fichiers = {
    [fichierRoute('v1/pricing.json')]: fluxDonnees, [fichierRoute('v1/facts.txt')]: fluxDonnees, [fichierRoute('v1/resources.json')]: fluxDonnees,
    [fichierRoute('api/pages/[[...slug]]')]: fluxDonnees,
    'public/llms.txt': '# Sample\n- [Pricing](https://example.com/v1/pricing.json): plans\n- [Facts](/v1/facts.txt)\n- Pages as text: https://example.com/api/pages/about\n',
    'public/robots.txt': 'User-agent: *\nAllow: /v1/resources.json\nDisallow: /api/\n',
  };
  assert.deepEqual(ouvertes(fichiers), []);
});

test('être bloquée dans robots.txt, être seulement proche d’une adresse listée, ou modifier des données ne compte pas', () => {
  const fichiers = {
    [fichierRoute('api/private.json')]: fluxDonnees, [fichierRoute('v1/pricing.json/details')]: fluxDonnees, [fichierRoute('v1/stats')]: fluxDonnees,
    [fichierRoute('v1/leads.json')]: `import { db } from '@/lib/db';\nexport async function POST(req: Request) { return Response.json(await db.lead.create({ data: await req.json() })); }\n`,
    'public/llms.txt': '- [Pricing](/v1/pricing.json)\n- [Leads](/v1/leads.json)\n',
    'public/robots.txt': 'User-agent: *\nAllow: /\nDisallow: /api/private.json\n',
  };
  assert.deepEqual(ouvertes(fichiers), ['GET /api/private.json', 'GET /v1/pricing.json/details', 'GET /v1/stats', 'POST /v1/leads.json']);
});

test('une route fourre-tout a besoin d’une adresse listée en dessous, et « / » seul ne couvre jamais tout', () => {
  const fichiers = { [fichierRoute('[...slug]')]: fluxDonnees, 'public/robots.txt': 'User-agent: *\nAllow: /\n', 'public/llms.txt': 'See https://example.com/ for more.\n' };
  assert.deepEqual(ouvertes(fichiers), ['GET /[...slug]']);
});

test('une liste dans un autre dépôt ne dit rien de celui-ci', () => {
  const racine = makeProject({
    'web/package.json': '{"name":"web","dependencies":{"next":"15"}}',
    'web/public/llms.txt': '- [Stats](/v1/stats)\n',
    'api/package.json': '{"name":"api","dependencies":{"next":"15"}}',
    'api/src/app/v1/stats/route.ts': fluxDonnees,
    'api/src/app/api/account/route.ts': PROTEGE[fichierRoute('api/account')],
  }, { repos: ['web', 'api'], arch: ARCH });
  try { scanAndBuild(racine); assert.deepEqual(openEndpoints(readGraph(racine)), ['GET /v1/stats']); } finally { cleanup(racine); }
});

// ---------- une réponse marquée pour tout le monde (#48, #49) ----------
test('une réponse mise en cache pour tout le monde est publique exprès, y compris via sa fonction d’aide', () => {
  const fichiers = {
    [fichierRoute('v1/product.json')]: `import { db } from '@/lib/db';\nexport async function GET() { return new Response(JSON.stringify(await db.plan.findMany()), { headers: { 'Cache-Control': 'public, max-age=3600' } }); }\n`,
    [fichierRoute('v1/sheet.txt')]: `import { db } from '@/lib/db';\nexport const dynamic = 'force-static';\nexport async function GET() { return new Response(await db.sheet()); }\n`,
    [fichierRoute('v1/hourly.json')]: `import { db } from '@/lib/db';\nexport const revalidate = 3600;\nexport async function GET() { return Response.json(await db.sheet()); }\n`,
    [fichierRoute('v1/helper.json')]: `import { db } from '@/lib/db';\nimport { publicJson } from '@/lib/public-json';\nexport async function GET() { return publicJson(await db.sheet()); }\n`,
    'src/lib/public-json.ts': `export const publicJson = (body: unknown) => Response.json(body, { headers: { 'cache-control': 'public, s-maxage=600' } });\n`,
    'src/lib/db.ts': `import { PrismaClient } from '@prisma/client';\nexport const db = new PrismaClient();\n`,
  };
  assert.deepEqual(ouvertes(fichiers), []);
});

test('une réponse privée, ou ouverte à d’autres sites mais non mise en cache, n’est pas publique pour autant', () => {
  const fichiers = {
    [fichierRoute('api/me.json')]: `import { db } from '@/lib/db';\nexport async function GET() { return new Response(JSON.stringify(await db.user.first()), { headers: { 'Cache-Control': 'private, no-store' } }); }\n`,
    [fichierRoute('api/open.json')]: `import { db } from '@/lib/db';\nexport async function GET() { return new Response(JSON.stringify(await db.user.first()), { headers: { 'Access-Control-Allow-Origin': '*' } }); }\n`,
    [fichierRoute('api/nocache.json')]: `import { db } from '@/lib/db';\nexport const revalidate = 0;\nexport async function GET() { return Response.json(await db.user.first()); }\n`,
  };
  assert.deepEqual(ouvertes(fichiers), ['GET /api/me.json', 'GET /api/nocache.json', 'GET /api/open.json']);
});

// ---------- ne lit rien de privé (#45, #46, #47, #52) ----------
test('un GET Next.js qui ne lit ni base de données, ni session, ni secret n’a pas de données à protéger', () => {
  const fichiers = {
    [fichierRoute('v1/policy.json')]: JSON_STATIQUE,
    [fichierRoute('v1/product.json')]: `export async function GET() { return Response.json({ pricing: process.env.NEXT_PUBLIC_PRICING, env: process.env.NODE_ENV }); }\n`,
    [fichierRoute('api/campaign/countdown')]: `const END = Date.parse('2026-12-01');\nexport async function GET() { return Response.json({ left: END - Date.now() }); }\n`,
    [fichierRoute('v1/links.json')]: `import { LINKS } from '@/lib/links';\nexport async function GET() { return Response.json(LINKS); }\n`,
    'src/lib/links.ts': `export const LINKS = ['/docs', '/pricing'];\n`,
    // un limiteur de débit garde ses comptes dans Redis, mais ce n’est pas ce que l’adresse du serveur renvoie
    [fichierRoute('v1/limited.json')]: `import { consumeRateLimit } from '@/lib/rate-limit';\nexport async function GET(req: Request) { await consumeRateLimit(req); return Response.json({ ok: true }); }\n`,
    'src/lib/rate-limit.ts': `import { Redis } from '@upstash/redis';\nconst r = Redis.fromEnv();\nexport const consumeRateLimit = (req: Request) => r.incr(req.url);\n`,
    [fichierRoute('api/pages/[[...slug]]')]: `import { PAGES } from '@/lib/pages';\nexport async function GET(_: Request, { params }: { params: { slug: string[] } }) { const p = PAGES[params.slug.join('/')]; return p ? new Response(p) : new Response('', { status: 404 }); }\n`,
    'src/lib/pages.ts': `export const PAGES: Record<string, string> = { about: 'About us' };\n`,
  };
  assert.deepEqual(ouvertes(fichiers), []);
});

test('lire une base de données, une session, un cookie, un secret ou un fichier choisi par l’appelant, même via un import, compte toujours', () => {
  const fichiers = {
    [fichierRoute('api/users')]: `import { prisma } from '@/lib/prisma';\nexport async function GET() { return Response.json(await prisma.user.findMany()); }\n`,
    [fichierRoute('api/orders')]: `import { listOrders } from '@/lib/orders';\nexport async function GET() { return Response.json(await listOrders()); }\n`,
    'src/lib/orders.ts': `import { lookup } from './store';\nexport const listOrders = () => lookup('orders');\n`,
    'src/lib/store.ts': `import { createClient } from '@supabase/supabase-js';\nconst c = createClient('https://x.supabase.co', 'anon');\nexport const lookup = (t: string) => c.from(t).select();\n`,
    'src/lib/prisma.ts': `import { PrismaClient } from '@prisma/client';\nexport const prisma = new PrismaClient();\n`,
    [fichierRoute('api/cart')]: `import { cookies } from 'next/headers';\nexport async function GET() { return Response.json({ cart: (await cookies()).get('cart')?.value }); }\n`,
    [fichierRoute('api/quote')]: `export async function GET() { const r = await fetch('https://pay.example.com', { headers: { key: process.env.PAYMENT_KEY! } }); return Response.json(await r.json()); }\n`,
    [fichierRoute('api/files/[name]')]: `import { readFile } from 'node:fs/promises';\nexport async function GET(_: Request, { params }: { params: { name: string } }) { return new Response(await readFile('uploads/' + params.name)); }\n`,
  };
  assert.deepEqual(ouvertes(fichiers), ['GET /api/cart', 'GET /api/files/[name]', 'GET /api/orders', 'GET /api/quote', 'GET /api/users']);
});

test('un import impossible à suivre pourrait contenir n’importe quoi, donc il compte comme une lecture de quelque chose', () => {
  assert.deepEqual(ouvertes({ [fichierRoute('api/orders')]: `import { listOrders } from '@/lib/missing';\nexport async function GET() { return Response.json(await listOrders()); }\n` }), ['GET /api/orders']);
});

test('un en-tête de cache public compte aussi dans les autres frameworks, sur l’adresse du serveur qui le pose', () => {
  const graphe = construire({ 'server/routes.js': [
    `import express from 'express';`, `const router = express.Router();`,
    `router.get('/api/plans', (req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json([]); });`,
    `router.get('/api/books', (req, res) => res.json([]));`,
    `export default router;`, '',
  ].join('\n') });
  assert.deepEqual(openEndpoints(graphe), ['GET /api/books']);
});

test('une lecture statique ne s’applique qu’à Next.js, où un fichier est une adresse du serveur', () => {
  const graphe = construire({ 'server/routes.js': `import express from 'express';\nconst router = express.Router();\nrouter.get('/api/books', (req, res) => res.json([]));\nexport default router;\n` });
  assert.deepEqual(openEndpoints(graphe), ['GET /api/books']);
});

// ---------- l’API propre d’un CMS (#42) ----------
const API_PAYLOAD = `/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */\n/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */\nimport config from '@payload-config';\nimport { REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@payloadcms/next/routes';\nexport const GET = REST_GET(config);\nexport const POST = REST_POST(config);\nexport const DELETE = REST_DELETE(config);\nexport const PATCH = REST_PATCH(config);\n`;

test('les routes d’API de Payload CMS contrôlent elles-mêmes l’accès', () => {
  const graphe = construire({ [fichierRoute('(payload)/api/[...slug]')]: API_PAYLOAD, [fichierRoute('(payload)/api/graphql')]: `import config from '@payload-config';\nimport { GRAPHQL_POST } from '@payloadcms/next/routes';\nexport const POST = GRAPHQL_POST(config);\n` });
  assert.deepEqual(openEndpoints(graphe), []);
  assert.deepEqual(graphe.sante.problemes.filter((i) => i.kind === 'unprotected-endpoint'), []);
});

test('une route qui a seulement une variable nommée payload n’est pas Payload CMS', () => {
  assert.deepEqual(ouvertes({ [fichierRoute('api/notes')]: `export async function POST(req: Request) { const payload = await req.json(); return Response.json(payload); }\n` }), ['POST /api/notes']);
});

// ---------- la réponse « POST seulement » d’un webhook, et comment il est verrouillé (#43) ----------
const POST_VERROUILLE = (controle) => `export async function POST(req: Request) {\n  ${controle}\n  return Response.json({ ok: true });\n}\n`;
const POST_SEUL = `export async function GET() { return Response.json({ error: 'POST only' }, { status: 405 }); }\n`;

test('un GET qui répond seulement « méthode non autorisée » n’est ni une adresse du serveur ouverte ni un risque de faux événements', () => {
  const graphe = construire({ [fichierRoute('api/partner/webhook')]: POST_SEUL + POST_VERROUILLE(`if (!verifyPartnerSignature(req)) return new Response('', { status: 401 });`) });
  assert.deepEqual(openEndpoints(graphe), []);
  assert.deepEqual(ouvertes({ [fichierRoute('api/items')]: `export const GET = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });\n` }), []);
});

test('un GET qui lit des données avant de répondre 405, ou une réponse « POST seulement » sur POST lui-même, compte toujours', () => {
  assert.deepEqual(ouvertes({ [fichierRoute('api/items')]: `import { db } from '@/lib/db';\nexport async function GET() { const rows = await db.item.findMany(); return Response.json(rows, { status: 405 }); }\n` }), ['GET /api/items']);
  assert.deepEqual(ouvertes({ [fichierRoute('api/items')]: `export async function POST(req: Request) { await req.json(); return Response.json({ ok: true }); }\n${POST_SEUL}` }), ['POST /api/items']);
});

test('un webhook verrouillé par un secret partagé ou une fonction d’aide n’est pas ouvert', () => {
  const verrous = [
    `if (req.headers.get('authorization') !== \`Bearer \${process.env.PARTNER_SECRET}\`) return new Response('', { status: 200 });`,
    `if (token !== process.env.PARTNER_TOKEN) return Response.redirect('/');`,
    `if (!crypto.timingSafeEqual(a, b)) return Response.redirect('/');`,
    `if (!isAuthorized(req)) return Response.redirect('/');`,
    `if (!verifyWebhookSecret(req)) return Response.redirect('/');`,
  ];
  for (const verrou of verrous) assert.deepEqual(ouvertes({ [fichierRoute('api/partner/webhook')]: POST_VERROUILLE(verrou) }), [], verrou);
});

test('un webhook qui ne fait rien pour vérifier son expéditeur est quand même signalé', () => {
  assert.deepEqual(ouvertes({ [fichierRoute('api/partner/webhook')]: POST_VERROUILLE(`const event = await req.json(); console.log(event);`) }), ['POST /api/partner/webhook']);
  assert.deepEqual(ouvertes({ [fichierRoute('api/partner/webhook')]: POST_VERROUILLE(`if (process.env.PARTNER_SECRET) console.log('configured');`) }), ['POST /api/partner/webhook']);
});

// ---------- le jeton de site d’un traceur de navigateur (#40) ----------
const JETON_SITE = ['a1b2c3d4', 'e5f6a7b8', 'c9d0e1f2'].join('');
const secrets = (source, p = 'src/components/Widget.tsx') => trouverProblemes(source, { path: p, category: 'code', lang: 'typescript' }).filter((x) => x.k === 'secret');

test('un jeton donné à un script de traçage du navigateur est public par conception', () => {
  const formes = [
    `export const T = () => <Script src="https://t.example.com/a.js" data-token="${JETON_SITE}" />;`,
    `const SITE_TOKEN = "${JETON_SITE}";\nexport const T = () => <Script src="https://t.example.com/a.js" data-site={SITE_TOKEN} />;`,
    `const token = "${JETON_SITE}";\nconst s = document.createElement('script');\ns.src = 'https://t.example.com/a.js';\ns.dataset.site = token;`,
    `const token = "${JETON_SITE}";\nconst s = document.createElement('script');\ns.setAttribute('data-site', token);`,
  ];
  for (const source of formes) assert.deepEqual(secrets(source), [], source);
  // le fichier dit ce qu’il est, et la balise script reçoit le jeton d’une autre façon
  assert.deepEqual(secrets(`const TRACKER_TOKEN = "${JETON_SITE}";\nexport const A = () => <Script src={\`https://t.example.com/a.js?id=\${TRACKER_TOKEN}\`} />;`, 'src/components/SiteAnalytics.tsx'), []);
});

test('un jeton près d’une balise script mais qui ne lui est pas donné, ou un secret par son nom, est quand même signalé', () => {
  const meme = 'const SITE_TOKEN = "' + JETON_SITE + '";\n';
  assert.equal(secrets(`${meme}fetch('/x', { headers: { t: SITE_TOKEN } });\nexport const T = () => <Script src="https://t.example.com/a.js" />;`).length, 1);
  assert.equal(secrets(`${meme}export const T = () => <div data-site={SITE_TOKEN} />;`).length, 1);
  assert.equal(secrets(`const SITE_TOKEN = "${JETON_SITE}";\nexport const send = () => fetch('/x', { headers: { t: SITE_TOKEN } });`, 'src/components/SiteAnalytics.tsx').length, 1);
  for (const nom of ['API_SECRET', 'ACCESS_TOKEN', 'AUTH_TOKEN', 'REFRESH_TOKEN', 'PRIVATE_KEY']) {
    assert.equal(secrets(`const ${nom} = "${JETON_SITE}";\nexport const T = () => <Script src="https://t.example.com/a.js" data-site={${nom}} />;`, 'src/components/SiteAnalytics.tsx').length, 1, nom);
  }
});

// ---------- fichiers qu’un outil ouvre par son nom (#50) ----------
const inutilises = (fichiers) => construire(fichiers).sante.problemes.filter((i) => i.kind === 'unused-file').flatMap((i) => i.items);

test('un fichier dont le commentaire dit qu’un outil l’ouvre, ou qu’il est généré, n’est pas inutilisé', () => {
  const entetes = [
    '// The CLI reads this file directly.', '/* This file is loaded by the migration runner at startup. */', '/**\n * Used by the tool: it opens this file by name.\n */',
    '# This file is read by the deploy script.', '/* THIS FILE WAS GENERATED AUTOMATICALLY. */', '// Do not delete: the build picks up this file at runtime.',
  ];
  entetes.forEach((entete) => assert.deepEqual(inutilises({ 'src/content/leftover.ts': `${entete}\nexport const x = 1;\n` }), [], entete));
});

test('un simple orphelin, ou un fichier qui ne mentionne ces mots qu’en passant, semble quand même inutilisé', () => {
  const trouvees = ['// Reads the config file and returns it.', '// TODO: wire this into the CLI', `const s = 'The CLI reads this file directly';`, '/**\n * Create a record with an auto-generated id.\n */', '/** Do not modify the input array. */', '// Generated by the form, this value is trimmed.'];
  trouvees.forEach((entete) => assert.deepEqual(inutilises({ 'src/content/leftover.ts': `${entete}\nexport const x = 1;\n` }), ['f:src/content/leftover.ts'], entete));
});
