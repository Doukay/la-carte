# Schéma d'architecture.json

`floorplan/architecture.json` décrit la structure : parties, modules, services extérieurs, parcours. Les noms et les descriptions des fichiers et des adresses du serveur prises une à une vont plutôt dans `floorplan/descriptions/*.json` (voir [ecrire-les-descriptions.md](ecrire-les-descriptions.md)). Les deux sont séparés pour que des agents en parallèle puissent les écrire sans conflit. `construire.mjs` vérifie les deux par rapport au scan et signale les problèmes champ par champ.

**Langue.** Tous les textes que ce fichier contient et que la personne verra (`summary`, `label`, `details`, `description`, `note`, `title`, `projet.summary`…) s'écrivent **en français, en langage simple, en tutoyant**, même si le code est en anglais. Les chemins, les méthodes et les URL restent tels quels. Les clés JSON ne se traduisent pas, sauf les trois clés de premier niveau `projet`, `parcours` et `visite`.

Sommaire : [Premier niveau](#premier-niveau) · [nodes](#nodes) · [Règles d'affectation](#comment-les-fichiers-sont-affectés) · [edges](#edges) · [annotations](#annotations) · [parcours](#parcours) · [Travail récent](#travail-récent) · [Exemple complet](#exemple-complet)

## Premier niveau

| champ | type | obligatoire | sens |
|---|---|---|---|
| `$schema` | `"floorplan/architecture@1"` | non | repère |
| `projet` | objet | oui | `name` (texte, obligatoire), `summary` (1 à 3 phrases), `entrypoints` (chemins de fichiers) |
| `nodes` | tableau | oui | parties et modules. Voir plus bas |
| `edges` | tableau | non | liens que le scan ne peut pas voir |
| `annotations` | tableau | non | notes épinglées sur des fichiers précis |
| `parcours` | tableau | non | visites guidées à travers le tableau |
| `visite` | tableau | non | la visite « Commencer ici » montrée à la première ouverture : 3 à 8 étapes `{ "node": "<id de nœud ou chemin de fichier>", "title": "…", "note": "…" }`, en langage simple, dans l'ordre où une personne qui arrive doit les voir. Le premier parcours est ajouté automatiquement à la fin |
| `audience` | `"everyone"` \| `"developers"` | non | pour qui les noms et les descriptions sont écrits. Par défaut `"everyone"` : langage simple qu'un propriétaire non technique comprend (ce que ça fait pour son activité, avec des mots de tous les jours). `"developers"` : style technique pour des ingénieurs |
| `include` | string[] | non | catégories de fichiers à cartographier. Par défaut `["code"]`. Les autres : `config`, `docs` |
| `ignore` | string[] | non | globs des fichiers à laisser complètement hors du tableau (code généré, bibliothèques copiées, jeux de test) |

## nodes

Chaque nœud est une pastille sur le tableau. La hiérarchie vient de `parent`. Un nœud sans parent se trouve sur le tableau de premier niveau.

| champ | type | sens |
|---|---|---|
| `id` | texte | unique ; lettres, chiffres, `_ - .`. Convention : pointé selon le parent (`api.orders`) |
| `label` | texte | nom court affiché (« Commandes ») |
| `kind` | énumération | `ui` `service` `worker` `library` `feature` `data` `config` `test` `script` `infra` `external` |
| `parent` | texte | id du nœud qui l'englobe |
| `summary` | texte | une phrase : de quoi il est responsable |
| `icon` | texte | facultatif, mais à remplir pour chaque partie : l'icône qui dit ce que ce bloc est **dans ce projet**, par exemple `panier` pour un site de courses. Liste plus bas |
| `details` | texte | notes plus longues, facultatives ; les lignes vides séparent les paragraphes |
| `paths` | string[] | globs qui réclament des fichiers (voir plus bas) |
| `exclude` | string[] | globs pour sortir des fichiers de `paths`. **Hérité par tous les descendants** : par exemple `"exclude": ["**/*.test.tsx"]` sur un nœud d'écrans garde les tests rangés à côté hors de chaque enfant, pour qu'un nœud Tests séparé puisse les réclamer |
| `packages` | string[] | **nœuds extérieurs :** noms de paquets que ce nœud représente, par exemple `"stripe"`, `"npm:@stripe/*"`, `"pypi:sqlalchemy"`. Les imports de ces paquets deviennent des liens vers ce nœud |
| `hosts` | string[] | **nœuds extérieurs :** noms d'hôtes appelés par le code, par exemple `"api.stripe.com"`, `"*.squareup.com"`. Les appels deviennent des liens `http` |
| `tags` | string[] | libres, affichés dans le panneau |

Les genres (`kind`), en bref :
- `ui` : écrans et applis
- `service` : un serveur déployable
- `worker` : tâches de fond et files d'attente
- `library` : code partagé
- `feature` : une tranche verticale à l'intérieur d'un service ou d'un écran
- `data` : modèles, migrations, la couche base de données
- `config`
- `test`
- `script` : scripts ponctuels et d'exploitation
- `infra` : déploiement, intégration continue, infrastructure en code
- `external` : bases de données et API tierces. Ils ne possèdent aucun fichier.

### Syntaxe des globs
- `**` correspond à n'importe quel nombre de dossiers, `*` reste dans un seul segment de chemin, `?` correspond à un caractère, `{a,b}` est une alternative.
- Un nom de dossier entier entre crochets, comme `[id]`, `[...slug]` ou `[[...slug]]` (Next.js, SvelteKit), correspond littéralement à ce dossier : `app/orders/[id]/**`. Ailleurs, `[abc]` correspond à l'un de ces caractères.
- Un motif sans joker correspond aussi comme dossier : `backend/app` équivaut à `backend/app/**`.
- Les chemins sont relatifs à la racine du code. Dans une racine à plusieurs dépôts, ils commencent par le dossier du dépôt.

### Comment les fichiers sont affectés
Chaque fichier inclus va dans un seul nœud :
1. Rassemble les nœuds dont les `paths` correspondent au fichier et dont l'`exclude` ne le retire pas.
2. Le nœud **le plus profond** gagne : un enfant l'emporte donc sur son parent. Tu peux donner à un parent un glob large (`web/**`) et à ses enfants des globs plus étroits ; les fichiers qu'aucun enfant ne réclame restent sur le parent.
3. Entre nœuds de même profondeur, le glob dont le début littéral est le plus long gagne. Les vraies égalités sont signalées par un avertissement.
4. Les fichiers qu'aucun nœud ne réclame vont dans une pastille automatique **non affectés**. Garde-la sous ~10 %.

Dans la carte, un nœud qui a plus d'environ 24 fichiers à lui regroupe automatiquement ces fichiers en pastilles de dossiers : pas besoin d'un nœud pour chaque dossier. Fais un nœud quand il a un sens.

## edges

N'ajoute que ce que l'analyse du code ne trouve pas. Les imports (`import`) et les appels HTTP reliés à des adresses du serveur (`http`) sont déjà dans le scan.

| champ | type | sens |
|---|---|---|
| `from`, `to` | texte | id de nœud **ou** chemin de fichier |
| `kind` | énumération | `import` `call` `http` `rpc` `event` `queue` `data` `config` |
| `label` | texte | court, par exemple `"POST /orders"`, `"order.paid"`, `"lit et écrit"` |
| `description` | texte | phrase facultative affichée quand on clique sur le tracé |

Bons candidats :
- service → base de données (`data`)
- émetteur → file d'attente → consommateur (`queue` / `event`)
- webhooks entrants envoyés par des tiers (`http`, du nœud extérieur vers le gestionnaire)
- tâche planifiée → job (`call`)
- fonctions Firebase en arrière-plan (planifiées, déclenchées par Firestore, Storage ou Pub/Sub, d'après la liste FIREBASE FUNCTIONS du scan) → un nœud `worker` ; relie la collection ou le sujet qui les déclenche (`event`)
- appels passant par des URL de base données par l'environnement que la mise en correspondance a ratés (`http`)

## annotations

`{ "path": "<fichier>", "note": "…", "tags": ["hotspot"] }` épingle une note sur un fichier. Le bloc du fichier reçoit un contour de couleur. Utilise-les avec parcimonie, pour les fichiers énormes qui font tout, les règles délicates, ou le code obsolète encore utilisé.

## parcours

Clé de premier niveau : `parcours`.

```json
{ "id": "checkout", "title": "Commander", "description": "facultatif",
  "steps": [ { "node": "web.cart", "note": "La personne clique sur Payer" }, { "node": "api.orders", "note": "Crée la commande" } ] }
```
- Le `node` de chaque étape est un id de nœud ou un chemin de fichier. Il faut au moins 2 étapes.
- La carte se place sur le tableau où chaque paire d'étapes consécutives est visible, et anime un signal entre elles.
- Écris les notes comme le commentaire dont une personne qui arrive aurait besoin, en langage simple.

## Travail récent

`floorplan/travail-recent.json` est un fichier à part, réécrit à chaque création et à chaque mise à jour. Il contient ce sur quoi on vient de travailler, présenté par rapport à ce que la personne avait demandé. La carte donne à ces blocs une étiquette verte « Modifié » ou « Nouveau », affiche « N modifié(s) » sur les parties qui les contiennent, ajoute chaque `note` au survol du bloc, et liste les tâches sous un bouton **Travail récent** et dans le panneau de vue d'ensemble.

```json
{
  "updatedAt": "2026-10-27T10:30:00Z",
  "tasks": [
    {
      "title": "Remboursement depuis la commande",
      "request": "Que le personnel puisse rembourser une commande directement depuis sa page",
      "summary": "Le personnel peut maintenant rembourser tout ou partie d'une commande depuis sa page. L'argent retourne sur la carte du client par Stripe, et il reçoit un e-mail. Au-delà de 500 €, il faut l'accord d'un responsable.",
      "items": [
        { "ref": "shop-api/app/services/refunds.py", "change": "new", "note": "Nouveau : calcule la somme à rembourser, la renvoie par Stripe et l'enregistre sur la commande. C'est le cœur de ce qui était demandé." },
        { "ref": "POST /api/orders/<int:order_id>/refund", "change": "new", "note": "La demande qu'envoie le bouton Rembourser ; elle vérifie la limite du responsable avant tout remboursement." }
      ]
    }
  ]
}
```

| champ | sens |
|---|---|
| `tasks[].title` | 2 à 5 mots, affichés au survol et comme titre du tableau |
| `tasks[].request` | ce que la personne a demandé, avec ses mots (raccourci). Affiché comme « Tu as demandé : … » |
| `tasks[].summary` | 1 à 2 phrases : ce qui a été fait pour y répondre, et où ça en est. Mentionne ici les suppressions ; les fichiers supprimés ne sont pas sur la carte |
| `items[].ref` | un chemin de fichier, un id de nœud ou `"METHODE /chemin"` exactement comme sur la carte. Les références qui ne sont pas sur la carte sont laissées de côté avec un avertissement |
| `items[].change` | `"new"` ou `"changed"` (par défaut) |
| `items[].note` | 1 à 2 phrases simples : ce qui a changé sur ce bloc, et en quoi ça sert la demande |

`{ "tasks": [] }` efface toutes les mises en avant.

## Exemple complet

Un dépôt d'écrans et un dépôt de serveur côte à côte :

```json
{
  "$schema": "floorplan/architecture@1",
  "projet": {
    "name": "Acme Shop",
    "summary": "La boutique en ligne : les clients commandent depuis le site, qui parle à un serveur central ; les commandes sont gardées dans une base de données et les paiements passent par Stripe.",
    "entrypoints": ["shop-api/app.py", "shop-web/src/app/page.tsx"]
  },
  "ignore": ["shop-api/migrations/versions/**"],
  "nodes": [
    { "id": "web", "label": "Site de la boutique", "kind": "ui", "summary": "Le site que les clients utilisent pour parcourir le catalogue et commander.", "paths": ["shop-web/src"] },
    { "id": "web.pages", "parent": "web", "label": "Pages", "kind": "feature", "paths": ["shop-web/src/app"] },
    { "id": "web.api", "parent": "web", "label": "Liaison avec le serveur", "kind": "library", "summary": "Envoie au serveur central chaque demande que le site fait.", "paths": ["shop-web/src/lib/api*"] },
    { "id": "api", "label": "Serveur principal", "kind": "service", "summary": "Le serveur central qui garde les produits, les commandes et les paiements.", "paths": ["shop-api/app.py", "shop-api/app"] },
    { "id": "api.routes", "parent": "api", "label": "Demandes reçues", "kind": "feature", "paths": ["shop-api/app/routes"] },
    { "id": "api.models", "parent": "api", "label": "Fiches enregistrées", "kind": "data", "paths": ["shop-api/app/models"] },
    { "id": "tests", "label": "Tests", "kind": "test", "paths": ["shop-api/tests", "shop-web/**/*.test.{ts,tsx}"] },
    { "id": "pg", "label": "Base de données", "kind": "external", "packages": ["pypi:sqlalchemy", "pypi:psycopg2"] },
    { "id": "stripe", "label": "Stripe", "kind": "external", "packages": ["stripe"], "hosts": ["api.stripe.com"] }
  ],
  "edges": [
    { "from": "stripe", "to": "api.routes", "kind": "http", "label": "alertes de paiement", "description": "Stripe prévient quand un paiement a réussi, et la commande est marquée payée." }
  ],
  "annotations": [
    { "path": "shop-api/app/routes/orders.py", "note": "Tous les changements d'état d'une commande passent par ce fichier.", "tags": ["hotspot"] }
  ],
  "parcours": [
    { "id": "checkout", "title": "Commander", "steps": [
      { "node": "web.pages", "note": "La page du panier envoie la commande" },
      { "node": "web.api", "note": "Fait la demande POST /api/orders" },
      { "node": "api.routes", "note": "Vérifie la commande et la crée" },
      { "node": "stripe", "note": "Prépare le paiement" }
    ]}
  ],
  "visite": [
    { "node": "web", "title": "Ce que voient les clients", "note": "C'est le site de la boutique : les clients y parcourent le catalogue et passent commande." },
    { "node": "api", "title": "Le serveur principal", "note": "Il garde les produits, les commandes et les paiements. Le site lui envoie chaque demande." },
    { "node": "stripe", "title": "Les paiements", "note": "Stripe prend les paiements par carte à la place de la boutique, et la prévient quand ils ont réussi." }
  ]
}
```

## Icônes

Choisis pour chaque partie (`icon` dans architecture.json) et chaque fichier (`icon` dans descriptions/*.json) l'icône qui correspond à ce qu'il fait dans **ce** projet, pas à sa nature technique : un service de remboursement prend `argent`, un site de promos `etiquette`, un écran de liste `liste`. Sans icône, le bloc garde celle de son type. Une icône inconnue donne un avertissement à la construction.

`appareil-photo`, `argent`, `boite`, `bouclier`, `cadeau`, `cadenas`, `calendrier`, `camion`, `carte-bancaire`, `cloche`, `code-barres`, `coeur`, `couches`, `courriel`, `document`, `donnees`, `dossier`, `eclair`, `ecran`, `etincelle`, `etiquette`, `etoile`, `fiole`, `globe`, `graphique`, `groupe`, `horloge`, `image`, `lien`, `lieu`, `liste`, `livre`, `loupe`, `magasin`, `maison`, `message`, `nuage`, `ordinateur`, `outils`, `palette`, `panier`, `personne`, `puce`, `reglages`, `robot`, `serveur`, `synchronisation`, `telechargement`, `telephone`, `terminal`, `ticket`
