// Django : le urls.py d’une appli inclus sous un préfixe par le urls.py du projet.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { creerProjet, executer, lireJson, nettoyer } from './aides.mjs';

const racine = creerProjet({
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
after(() => nettoyer(racine));

test('les urls incluses sous un préfixe le reçoivent, et la ligne include n’est pas elle-même une adresse du serveur', () => {
  executer('analyser.mjs', racine);
  const analyse = lireJson(path.join(racine, 'floorplan', '.cache', 'analyse.json'));
  assert.deepEqual(analyse.routes.map((r) => `${r.file} ${r.path}`).sort(), [
    'orders/urls.py /api/orders',
    'orders/urls.py /api/orders/<int:pk>',
    'shop/urls.py /api/shop/cart',
  ]);
  assert.ok(analyse.edges.some((e) => e.from === 'mysite/urls.py' && e.to === 'orders/urls.py'), 'les urls du projet devaient utiliser les urls de l’appli');
  assert.deepEqual(analyse.http.map((h) => `${h.from} -> ${h.path}`), ['web/api.js -> /api/orders/<int:pk>']);
});
