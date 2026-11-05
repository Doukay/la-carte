# Écrire les noms et les descriptions

Chaque bloc de la carte montre un **nom** et une **description**. Le chemin du fichier et celui de l'adresse du serveur restent affichés, mais en petit dessous. Le but : qu'une personne qui n'a jamais vu le code puisse lire le tableau comme un schéma du système.

Ce guide couvre les noms et les descriptions de `descriptions/*.json`, ainsi que les `label` et `summary` des nœuds et le `projet.summary` d'`architecture.json`.

## La langue : français, langage simple, tutoiement

**Tout ce qui sera affiché s'écrit en français, en langage simple, en tutoyant la personne**, même si le code, ses commentaires et ses noms de fichiers sont en anglais. C'est vrai pour :

- `architecture.json` : `projet.summary`, `label`, `summary`, `details` des nœuds, `description` et `label` des liens, notes des annotations, titres et notes des `parcours` et de la `visite` ;
- `descriptions/*.json` : tous les `name` et `description` ;
- `travail-recent.json` : `title`, `request`, `summary`, `note` ;
- `plan.json` : `name`, `description`, `assumptions`, `questions` ;
- le rapport que tu fais à la personne à la fin.

Une description décrit en général la chose et ne s'adresse pas à la personne ; mais dès que tu t'adresses à elle (rapport, notes d'une visite, avertissements), tu la tutoies : « Tu peux modifier ces fichiers », « Ici tu retrouves… ».

**Ne recopie pas l'anglais du code.** Tu lis un nom de fonction ou un commentaire anglais, tu en comprends le sens, et tu l'écris en français : `sendInvoiceEmail` devient « envoie la facture par e-mail », pas « Send invoice email ». Les noms de produits restent tels quels (Stripe, Shopify, Postgres, SendGrid). **Les chemins, les méthodes et les URL aussi** (`POST /api/orders/<id>/ship`) : ils sont déjà affichés sur le bloc, tu ne les traduis pas et tu ne les expliques pas.

Les clés du JSON ne bougent jamais (voir plus bas).

## Pour qui tu écris : `audience`

`architecture.json` a un `"audience"` facultatif au premier niveau. L'en-tête de chaque fiche de travail le rappelle.

- **`"everyone"` (par défaut).** Suppose que la personne qui lit est la propriétaire de l'appli, pas une ingénieure. Souvent elle l'a construite avec une IA et ne sait pas comment ça marche à l'intérieur. Écris en **langage simple** : ce que la chose fait pour l'activité ou pour ses utilisateurs, avec des mots de tous les jours. Reste précis et exact. Voir [Langage simple](#langage-simple) plus bas.
- **`"developers"`.** La personne qui lit est un ingénieur qui arrive dans le code. Nommer les frameworks, les patrons et les mécanismes est permis et souvent utile (« blueprint Flask », « modèle SQLAlchemy », « consommateur Pub/Sub »). La langue reste le français.

N'utilise `"developers"` que si la personne le demande, ou si la carte est visiblement pour une équipe d'ingénierie (une bibliothèque, un SDK, du code d'infrastructure). Dans le doute, prends `"everyone"`.

## Où ça va

`decrire.mjs` écrit une fiche de travail par module (`la-carte/.cache/worksheets/<clé>.md`) et un squelette correspondant (`la-carte/descriptions/<clé>.json`) :

```json
{
  "files": {
    "api/app/services/inventory_bulk_service.py": { "name": "Mises à jour de stock en masse", "description": "Applique en arrière-plan les changements de stock d'un tableur envoyé, en vérifiant chaque ligne avant de rien modifier." }
  },
  "routes": {
    "GET /api/products/<int:product_id>/activity": { "name": "Historique d'un produit", "description": "Montre qui a modifié un produit et quand, du plus récent au plus ancien." }
  }
}
```

Remplis chaque `description` et améliore chaque `name`. Pour chaque fichier, ajoute aussi `icon` : l'icône qui dit ce qu'il fait **dans ce projet** (liste dans [schema.md](schema.md#icônes)). À part `icon`, **ne change, n'ajoute et ne retire aucune clé.** Les clés (les chemins de fichiers, les `"METHODE /chemin"`, et les noms `files`, `routes`, `name`, `description`) servent à `construire.mjs` pour relier les entrées aux fichiers et aux adresses du serveur. Garde le JSON valide.

## Noms

- 2 à 5 mots, avec une majuscule seulement à la première lettre (comme dans une phrase), qui disent ce que la chose *est* ou *fait* avec les mots de l'activité de la personne. Courts et concrets : « Application du personnel », « Serveur principal », « Cartes cadeaux », « Remboursements ».
- Ne te contente pas de répéter le nom du fichier. `inventory_bulk_service.py` devient « Mises à jour de stock en masse », pas « Service inventory bulk ». `page.tsx` dans `dashboard/products/` devient « Page des produits ».
- Les éléments d'écran reçoivent le nom qu'une personne reconnaîtrait : « Éditeur de photos produit », « Tableau des règles de remise ».
- Les tests : « Tests de <sujet> », par exemple « Tests des mises à jour de stock en masse ».
- Les migrations et les scripts disent ce qu'ils font : « Ajoute les soldes de cartes cadeaux », « Relie les anciens clients à Stripe ».
- Les adresses du serveur se nomment du point de vue de celui qui appelle : « Historique d'un produit », « Marquer des commandes expédiées », « Alertes de Stripe ».
- Les noms de produits restent tels quels (Stripe, Shopify, Postgres, SendGrid). Les gens les connaissent, et le glossaire de la carte explique les termes techniques.

## Descriptions

- **Une phrase, idéalement d'environ 140 caractères au plus**, au présent, qui commence par un verbe à la 3e personne du singulier : « Garde… », « Montre… », « Envoie… », « Vérifie… ». Le français est plus long que l'anglais : coupe les mots inutiles plutôt que de faire une phrase à rallonge.
- Dis de quoi la chose est responsable et ce qui est notable : un effet de bord (change des prix sur Shopify, envoie un e-mail au client), une contrainte (réservé au personnel, sans danger si on la relance), ou un rôle (le seul endroit où X se décide).
- Utilise des noms concrets de l'activité : « carte cadeau », « liste de préparation », « fiche Shopify », pas « données », « éléments », « trucs ».
- Ne commence pas par « Ce fichier… », ne tourne pas autour du pot, et ne répète pas le nom.
- Pour les adresses du serveur, décris l'effet, pas la mécanique HTTP. « Marque une commande comme expédiée et envoie au client son lien de suivi » vaut mieux que « Adresse POST pour la passer à expédiée ».
- Écris en bon français, avec les accents et la typographie (espace avant `:`, `;`, `?`, `!` ; guillemets « comme ça » ; apostrophe `'`). Évite les anglicismes quand un mot courant existe (« e-mail » ou « mail », pas « email » seul ; « connexion », pas « login »).
- Fais attention aux accords et aux élisions (« l'adresse », « d'une commande ») : relis une fois.

## Langage simple

Le public par défaut est `"everyone"`. Écris comme si tu expliquais l'appli à sa propriétaire autour d'un café : elle connaît son activité sur le bout des doigts, mais pas le code.

**Tu n'as pas à porter l'identité technique.** Le vrai chemin est écrit sous chaque bloc, et les blocs d'adresses du serveur montrent la méthode et l'URL (`POST /api/orders/<id>/ship`). « Détail technique » dans la carte révèle les exports, le nombre de lignes et les termes de développeur. La description est donc libre de dire seulement à quoi sert la chose.

### Règles

1. **Commence par le travail, pas par le mécanisme.** Qu'est-ce que ça fait pour le personnel, les clients ou l'activité ? « Encaisse les paiements par carte au moment de commander », pas « Enveloppe de l'API Stripe Payments ».
2. **Des mots de tous les jours.** Remplace le jargon par l'expression simple du tableau plus bas. Si un mot technique est vraiment le plus clair (une « base de données », une « connexion »), il peut rester. La carte souligne les termes courants et les explique au survol.
3. **Reste précis.** Simple ne veut pas dire flou. « Gère les commandes » est simple *et* inutile. « Réserve le stock d'une commande en ligne le temps de vérifier le paiement, puis le libère ou l'expédie » est simple et apprend quelque chose.
4. **Nomme les services extérieurs.** « Envoie les nouveaux prix à Shopify et Amazon » vaut mieux que « Synchronise avec les canaux externes ».
5. **Pas de noms de frameworks ni de bibliothèques dans les descriptions** (Flask, SQLAlchemy, React, Radix, Pydantic…), sauf si la chose existe *à cause* de cet outil. Les libellés peuvent garder un nom de produit que la propriétaire a choisi et connaît (par exemple « Stripe », « Google Cloud »).
6. **Pas de nombres de lignes de code, de noms de fichiers ni d'identifiants du code** (« ~6,7 k lignes », « product_routes.py », `ApiClient`) dans les résumés. Ça va dans les `annotations` ou c'est affiché ailleurs.
7. **Les avertissements en mots simples.** « À lancer à la main sur les vraies données ; vérifie bien avant de t'en servir » plutôt que « script de prod non idempotent ».

### Jargon → mots simples

| Au lieu de | Dis |
|---|---|
| API | la façon dont les programmes se parlent ; pour la tienne, « le serveur principal » (par ex. « demande les tarifs d'expédition à Shippo ») |
| endpoint, route (serveur) | une demande que l'appli peut recevoir (par ex. « la demande qui marque une commande expédiée ») |
| page, route (écrans) | un écran / une page |
| webhook | un message qu'un autre service envoie à ton appli quand quelque chose se passe (« Stripe nous prévient qu'un paiement est passé ») |
| REST, HTTP, GET/POST | (n'en parle pas : la méthode et l'URL sont déjà sur le bloc) |
| frontend / client | l'appli que les gens utilisent / les écrans |
| backend / serveur / service | le serveur principal, la partie qui fait le travail derrière les écrans |
| monolithe | un seul serveur principal qui fait tout |
| blueprint, routeur, contrôleur | un groupe de demandes qui vont ensemble (par ex. « les demandes sur les commandes ») |
| middleware | une vérification que chaque demande traverse (par ex. « s'assure que tu es connecté ») |
| modèle ORM, schéma, entité | la façon dont une sorte de fiche est enregistrée (par ex. « comment une commande est enregistrée ») |
| table, ligne | une liste de fiches / une fiche |
| requête (base de données) | une recherche dans les fiches |
| base de données (Postgres, MySQL, RDS, Cloud SQL) | la base de données, là où toutes les fiches sont gardées |
| migration | un changement dans la façon d'enregistrer les fiches (par ex. « ajoute une place pour les numéros de cartes cadeaux ») |
| seed, fixture | des données d'exemple pour les essais |
| worker, tâche de fond (job) | une tâche qui tourne toute seule en arrière-plan |
| file d'attente (queue), outbox, Pub/Sub, bus de messages | une file de tâches à traiter / une façon de passer du travail aux tâches de fond |
| cron, planificateur, tâche planifiée | se lance automatiquement à heure fixe (par ex. « chaque nuit à 2 h ») |
| cache, snapshot | une copie gardée de côté pour que ça s'affiche plus vite |
| SDK, bibliothèque cliente, client d'API | du code tout fait pour parler à un service (par ex. « parle à Stripe ») |
| intégration, synchronisation | garde X et Y à jour l'un par rapport à l'autre / recopie les changements entre X et Y |
| variable d'environnement, config | des réglages (par ex. « quelle boutique et quel mot de passe utiliser ») |
| secret, clé d'API, jeton (token) | un mot de passe pour un service / un laissez-passer de connexion |
| auth, authentification | la connexion |
| autorisation, rôles, permissions, RBAC | qui a le droit de faire quoi |
| session | rester connecté |
| hook, contexte, provider (React) | de la logique d'écran partagée / garde les écrans en phase |
| composant, kit d'interface, primitives | une brique des écrans (bouton, tableau, fenêtre) |
| état (state) | ce dont l'écran se souvient à cet instant |
| déploiement, CI/CD | mettre une nouvelle version en ligne |
| conteneur, Docker, Cloud Run, serverless | l'endroit où le serveur tourne dans le cloud |
| bucket de stockage, S3, GCS, blob | du stockage de fichiers dans le cloud (images, envois, exports) |
| CDN | un réseau de livraison rapide pour les images et les fichiers |
| idempotent | sans danger si on le lance deux fois |
| limitation de débit (rate limit) | un plafond sur la fréquence à laquelle on peut demander quelque chose |
| rapprochement (reconcile) | compare deux enregistrements de la même chose et corrige les écarts |
| refactor, dette technique | (n'en parle pas) |
| serveur MCP | une connexion qui permet aux assistants IA (comme Claude) de chercher des choses dans ton appli |
| tests unitaires, suite de tests | des vérifications automatiques que le code marche toujours |

### Exemples

Les ✗ montrent des textes calqués sur l'anglais et le jargon du code ; les ✓ montrent ce qu'il faut écrire.

**Modules et parties (`summary` d'`architecture.json`)**

| | |
|---|---|
| ✗ | « Monolithe Flask avec des blueprints de routes au-dessus d'une couche de services et de modèles SQLAlchemy. » |
| ✓ | « Le serveur principal : la boutique et l'application du personnel lui parlent, et il garde en phase les stocks, les prix, les commandes et les cartes cadeaux entre Shopify, Stripe et l'entrepôt. » |
| ✗ | « Primitives basées sur Radix (components/ui) et coque du dashboard. » |
| ✓ | « Les briques communes à tous les écrans : boutons, tableaux, fenêtres, et le menu et le cadre de l'application du personnel. » |
| ✗ | « Workers Cloud Run longue durée : inventaire en masse, pricing, relances de paniers abandonnés, réconciliation Stripe. » |
| ✓ | « Des tâches qui tournent seules en arrière-plan ou à heure fixe : grosses mises à jour de stock, changements de prix, e-mails de paniers abandonnés et contrôle de nuit des versements Stripe. » |

**Fichiers (`descriptions/*.json`)**

| | |
|---|---|
| ✗ | nom « Service carte cadeau Stripe », « Enveloppe l'API de solde client Stripe pour la projection du grand livre. » |
| ✓ | nom « Soldes des cartes cadeaux », « Garde le solde de chaque carte cadeau dans Stripe identique à celui que la boutique montre au client. » |
| ✗ | nom « Contexte useAuth », « Provider de contexte React qui expose l'état d'authentification et le rafraîchissement du token. » |
| ✓ | nom « Connexion du personnel », « Retient quel membre du personnel est connecté, le garde connecté, et cache le tableau de bord à tous les autres. » |
| ✗ | nom « Verrou de commande », « Advisory lock Postgres indexé sur l'identifiant de commande Shopify. » |
| ✓ | nom « Une commande à la fois », « Évite qu'une même commande en ligne soit traitée deux fois quand Shopify envoie des alertes en double. » |

**Adresses du serveur**

| | |
|---|---|
| ✗ | nom « POST ship », « Endpoint POST qui fait passer une commande à l'état expédié. » |
| ✓ | nom « Marquer une commande expédiée », « Marque une commande comme expédiée et envoie au client son lien de suivi par e-mail. » |
| ✗ | nom « Webhook Stripe », « Reçoit les payloads de webhook Stripe et vérifie leur signature. » |
| ✓ | nom « Alertes de Stripe », « Stripe appelle cette adresse quand un paiement, un remboursement ou un litige change ; elle vérifie que le message est authentique et le met en file. » |

**Écrans et tâches de fond**

| | |
|---|---|
| ✗ | nom « DashboardLayout », « Layout Next.js qui enveloppe les pages du dashboard avec la sidebar. » |
| ✓ | nom « Cadre du tableau de bord », « Le menu latéral et l'en-tête qui entourent toutes les pages de l'application du personnel. » |
| ✗ | nom « Cron panier », « Job planifié qui relance les paniers abandonnés via SendGrid. » |
| ✓ | nom « Relance des paniers abandonnés », « Chaque soir, écrit aux clients qui ont laissé un panier plein sans payer. » |

Pour `"developers"`, la colonne ✗ est plus proche du bon style (sans le remplissage) ; écris-la quand même en français, avec les termes techniques courants. Mêmes règles pour le reste : une phrase, verbe d'abord, précis.

## Comment travailler

1. Lis la fiche de travail. Elle liste pour chaque fichier ses définitions, ses docstrings, ce qu'il utilise et ce qui l'utilise, et pour chaque adresse du serveur son gestionnaire. Ça suffit pour la plupart des fichiers.
2. Ouvre le fichier (les ~80 premières lignes, ou le gestionnaire précis) seulement quand le condensé laisse son rôle flou. Les noms génériques (`utils.py`, `index.ts`, `common.py`) et les gros fichiers demandent souvent un coup d'œil.
3. Écris le JSON d'un seul coup par fiche, dans le style que demande la ligne `Audience` de la fiche, et toujours en français.
4. Sois cohérent dans un module : des fichiers voisins doivent se lire comme un ensemble.

## Niveau d'exigence

Une bonne description permet de choisir le bon fichier à ouvrir sans ouvrir les autres. Si deux voisins se retrouvent avec des descriptions presque identiques, cherche ce qui les distingue vraiment et dis-le. Pour `"everyone"`, vérifie aussi : la propriétaire comprendrait-elle chaque mot sans demander ?

Avant de rendre tes fiches, relis une fois : tout est-il en français, sans anglais recopié du code ? Les chemins, méthodes et URL sont-ils restés intacts ? Les clés du JSON n'ont-elles pas bougé ?
