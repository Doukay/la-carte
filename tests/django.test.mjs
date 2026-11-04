// Django : le urls.py d’une appli inclus sous un préfixe par le urls.py du projet.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeProject, run, readJson, cleanup } from './helpers.mjs';

const racine = makeProject({
  'manage.py': '',
  'mysite/__init__.py': '',
  'mysite/urls.py': [
    'from django.urls import include, path, re_path',
    'urlpatterns = [',
    '    path("api/orders/", include("orders.urls")),',
    '    re_path(r"^api/shop/", include(("shop.urls", "shop"), namespace="shop")),',
    ']',
  ].join('\n'),
  'orders/__init__.py': '',
  'orders/urls.py': 'from django.urls import path\nfrom . import views\nurlpatterns = [\n    path("", views.order_list),\n    path("<int:pk>/", views.order_detail),\n]\n',
  'orders/views.py': 'def order_list(request): ...\ndef order_detail(request, pk): ...\n',
  'shop/__init__.py': '',
  'shop/urls.py': 'from django.urls import path\nfrom . import views\nurlpatterns = [path("cart/", views.cart)]\n',
  'shop/views.py': 'def cart(request): ...\n',
  'web/api.js': 'export const getOrder = (id) => fetch(`/api/orders/${id}/`);\n',
});
after(() => cleanup(racine));

test('les urls incluses sous un préfixe le reçoivent, et la ligne include n’est pas elle-même une adresse du serveur', () => {
  run('scan.mjs', racine);
  const analyse = readJson(path.join(racine, 'floorplan', '.cache', 'scan.json'));
  assert.deepEqual(analyse.routes.map((r) => `${r.file} ${r.path}`).sort(), [
    'orders/urls.py /api/orders',
    'orders/urls.py /api/orders/<int:pk>',
    'shop/urls.py /api/shop/cart',
  ]);
  assert.ok(analyse.edges.some((e) => e.from === 'mysite/urls.py' && e.to === 'orders/urls.py'), 'les urls du projet devaient utiliser les urls de l’appli');
  assert.deepEqual(analyse.http.map((h) => `${h.from} -> ${h.path}`), ['web/api.js -> /api/orders/<int:pk>']);
});
