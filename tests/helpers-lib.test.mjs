// Les petits outils sur lesquels tout le reste s’appuie : motifs (globs) d’architecture.json, classement des fichiers,
// options de ligne de commande, noms par défaut et correspondance des chemins d’adresses du serveur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';

const { compilerMotif, classer, lireArguments } = await lib('common.mjs');
const { humaniser, nomFichierParDefaut, nomRouteParDefaut } = await lib('names.mjs');
const { segmentsRoute } = await lib('routes.mjs');

test('motifs : ** traverse les dossiers, * reste dans un seul, les accolades et les dossiers nus marchent', () => {
  const g = (glob, p) => compilerMotif(glob).test(p);
  assert.ok(g('src/**/*.ts', 'src/a/b.ts'));
  assert.ok(g('src/**/*.ts', 'src/b.ts'));
  assert.ok(!g('src/*.ts', 'src/a/b.ts'));
  assert.ok(g('src/{a,b}', 'src/b/z.js'), 'un dossier entre accolades réclame tout ce qu’il contient');
  assert.ok(g('src/components', 'src/components/x/y.tsx'), 'un dossier simple réclame tout ce qu’il contient');
  assert.ok(!g('src/components', 'src/components-old/y.tsx'));
  assert.ok(g('**/*.test.ts', 'x.test.ts'));
  assert.ok(g('./src/', 'src/a.ts'), 'un ./ au début et un / à la fin sont ignorés');
});

test('motifs : un nom de dossier entre crochets ([id], [...slug]) est un dossier, pas une classe de caractères', () => {
  const g = (glob, p) => compilerMotif(glob).test(p);
  assert.ok(g('app/orders/[id]/**', 'app/orders/[id]/page.tsx'));
  assert.ok(!g('app/orders/[id]/**', 'app/orders/i/page.tsx'));
  assert.ok(g('app/[...slug]', 'app/[...slug]/page.tsx'));
  assert.ok(g('app/[[...slug]]/page.tsx', 'app/[[...slug]]/page.tsx'));
  assert.ok(g('src/file[12].ts', 'src/file2.ts'), 'dans un nom, les crochets désignent toujours un seul caractère');
});

test('motifs : un motif plus précis obtient un meilleur score', () => {
  assert.ok(compilerMotif('api/routes/**').specificity > compilerMotif('api/**').specificity);
});

test('classer : code, documentation, fichiers de verrou, ressources et fichiers générés', () => {
  assert.deepEqual(classer('src/a.ts', 100), { category: 'code', lang: 'typescript' });
  assert.deepEqual(classer('app/main.py', 100), { category: 'code', lang: 'python' });
  assert.equal(classer('README.md', 10).category, 'docs');
  assert.equal(classer('package-lock.json', 10).category, 'lock');
  assert.equal(classer('logo.png', 10).category, 'asset');
  assert.equal(classer('dist/app.min.js', 10).category, 'generated');
});

test('lireArguments : positionnels, --option valeur, --option=valeur et options seules', () => {
  assert.deepEqual(lireArguments(['root', '--port', '9', '--no-open', '--x=1']), { _: ['root'], port: '9', 'no-open': true, x: '1' });
});

test('les noms par défaut se lisent comme des mots simples', () => {
  assert.equal(humaniser('order_service'), 'Order service');
  assert.equal(humaniser('OrderService'), 'Order service');
  assert.equal(nomFichierParDefaut('api/routes/order_service.py'), 'Order service');
  assert.equal(nomRouteParDefaut({ method: 'POST', path: '/orders/:id/refund' }), 'Créer orders refund');
});

test('chemins d’adresses du serveur : les paramètres, dans tous les styles de framework, correspondent à n’importe quoi', () => {
  assert.deepEqual(segmentsRoute('/orders/:id/refund'), ['orders', '*', 'refund']);
  assert.deepEqual(segmentsRoute('/orders/{id}'), ['orders', '*']);
});
