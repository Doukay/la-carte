# Choisir les frontières

Le tableau est utile quand chaque pastille est quelque chose qu'une personne nommerait en discutant devant un tableau blanc. Il est inutile quand il se contente de recopier l'arborescence des dossiers. Ces règles t'aident à y arriver.

Rappel : les `label` et les `summary` que tu écris ici sont lus par la personne. Ils s'écrivent **en français, en langage simple, en la tutoyant si tu t'adresses à elle**, même si le code est en anglais (voir [writing-descriptions.md](writing-descriptions.md)).

## Le tableau de premier niveau (3 à 9 pastilles)

Demande-toi : *quelles sont les choses déployables ou qui ont un responsable, et avec quoi parlent-elles ?*

- **Code réparti sur plusieurs dépôts.** En général une pastille par chose déployable (écrans, serveur, tâches de fond, une deuxième appli comme un espace d'administration ou une appli mobile), plus les bibliothèques partagées, plus les services extérieurs. Le dépôt n'est pas toujours la bonne unité : un dépôt de serveur peut contenir une API *et* des tâches de fond *et* un connecteur MCP : donne à chacun sa pastille.
- **Monorepo** (`apps/*`, `packages/*`, `services/*`). Les applis et les services deviennent des pastilles de premier niveau. Regroupe les paquets en une seule pastille « Code partagé » avec des enfants, sauf si un paquet est gros et central.
- **Un seul gros bloc de code.** Prends les couches ou les domaines comme premier niveau (« Écrans web », « Services métier », « Données », « Tâches de fond »), ou les 4 à 8 plus gros domaines si le code est organisé par fonctionnalité. Choisis ce que le code suit réellement.
- **Services extérieurs.** Ajoute la ou les bases de données et chaque API tierce dont le code dépend vraiment. Utilise les listes EXTERNAL PACKAGES et EXTERNAL HOSTS du scan ; les `packages` et `hosts` des nœuds `external` les relient automatiquement. Laisse de côté les bibliothèques utilitaires (react, lodash, pytest) : ce sont des dépendances, pas de l'architecture.
- **Tests, scripts, migrations.** Donne-leur leurs propres pastilles de premier niveau (`kind: test`, `script`, `data`) plutôt que de les mélanger au service. Sinon ils noient la vraie structure des dépendances : les tests importent tout.

## Deuxième niveau (3 à 12 par pastille)

- Préfère la **responsabilité** au **type de fichier**. « Commandes », « Stock » et « Connexion » valent mieux que « routes », « services » et « modèles » quand le code est organisé ainsi. Mais si le code est vraiment en couches (routes/ → services/ → models/), reproduis les couches. Un tableau en couches qui montre routes → services → modèles est honnête et lisible.
- Un enfant vaut la peine d'être créé quand il a un but clair en une phrase et assez de fichiers (environ 3 et plus) ou d'importance (un client d'API central) pour compter.
- Les grosses arborescences d'écrans : groupe par domaine (`produits`, `commandes`, `paiement`), et garde une pastille « Briques communes » pour les éléments partagés (`components/ui`). Cette pastille aura beaucoup de tracés entrants. C'est normal et utile à voir.
- Ne va pas au-delà de trois niveaux de nœuds. La carte te donne déjà les niveaux dossier, fichier et symbole sous tes nœuds.

## Couvrir les fichiers

- Écris des globs larges sur les parents (`backend/app/**`), puis des globs plus étroits sur les enfants. Le plus profond l'emporte, donc tu n'as jamais besoin d'`exclude` juste pour empêcher un parent de voler les fichiers d'un enfant.
- Après le build, regarde les `non affectés, par dossier` et donne à chaque dossier un peu gros une pastille d'accueil ou une entrée `ignore`.
- `ignore` sert pour ce qui n'est pas le système : clients générés, copies de bibliothèques, jeux de test figés, extractions de données ponctuelles. Ce n'est pas pour les tests ni les scripts, qui ont leurs propres pastilles.

## Résumés

Une phrase, sur la responsabilité, avec le vocabulaire propre au code (traduit en français simple). « Garde le catalogue et le stock en phase avec Shopify » vaut mieux que « Contient les services liés à Shopify ». Ne cite le framework qu'au premier niveau, et seulement si la personne le connaît.

## Parcours

Choisis 1 à 3 choses pour lesquelles le système existe (prendre une commande, synchroniser le stock, lancer une tâche de nuit). Suis-les à travers le tableau en 3 à 7 étapes, de la personne ou du déclencheur jusqu'à l'effet final. Vérifie que des étapes consécutives sont bien reliées par un import, un appel au serveur ou un lien explicite ; sinon, ajoute le lien manquant. Le parcours doit rendre le chemin principal du système évident pour quelqu'un qui le voit pour la première fois. Les notes de chaque étape s'écrivent en français simple.

## Dernières vérifications avant de finir

- Le tableau de premier niveau, lu de gauche à droite, raconte-t-il l'histoire du système (écrans → serveur → services → données et services extérieurs) ?
- Une pastille est-elle reliée à presque tout ? Soit c'est une brique partagée (très bien, dis-le dans son nom), soit sa frontière est mal placée.
- Y a-t-il des tracés inattendus, comme les écrans qui importent du code du serveur, ou des tests importés par le code de production ? Signale-les à la personne : ce sont souvent les trouvailles les plus précieuses.
