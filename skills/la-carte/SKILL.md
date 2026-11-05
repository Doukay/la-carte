---
name: la-carte
description: "Dessine la carte d'un code (un dépôt, ou plusieurs côte à côte) : un graphe interactif où chaque partie, module, fichier et adresse du serveur a un nom lisible et une description d'une ligne, relié par les imports et les appels au serveur, avec plusieurs niveaux de zoom. Elle est enregistrée dans la-carte/index.html, un fichier autonome placé dans le code. À utiliser dès que la personne veut visualiser, cartographier, schématiser, documenter ou avoir une vue d'ensemble d'un code, d'un dépôt ou d'un monorepo, comprendre comment son appli est construite ou reliée sous le capot, s'y retrouver dans un code qu'elle ne connaît pas, voir comment l'écran parle au serveur, ou mettre à jour une carte existante, même si elle ne dit pas « visualiser ». Exemples de demandes : « fais la carte de mon code », « comment mon appli est construite ? », « mets à jour la carte », « la-carte », « map my codebase ». Sert aussi avant tout code : quand la personne partage un cahier des charges, une spécification ou la description de quelque chose à construire (« voici mon cahier des charges, quelles pièces faut-il ? »), elle dessine un plan, la même carte, prévue à partir du document."
argument-hint: "[path-to-codebase-root] [--refresh]"
allowed-tools:
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/actualiser.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/analyser.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/construire.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/decrire.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/etat.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/ouvrir.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs *)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/recents.mjs *)
---

# La carte

Tu produis `la-carte/` à la racine du code : une carte de l'appli qu'une personne qui arrive peut lire comme un schéma du système. Chaque bloc montre un nom lisible et une description d'une ligne, avec le vrai chemin en petit dessous.

- **Tu écris :** `sources/architecture.json` (parties, modules, parcours) et `sources/descriptions/*.json` (un nom et une description pour chaque fichier et chaque adresse du serveur).
- **Généré :** `.cache/graphe.json` et `index.html`.

Les scripts font le travail mécanique : trouver les dépôts, lire les imports et les adresses du serveur, relier les appels aux adresses, la mise en page et le dessin. Ton travail, c'est la partie que seul un lecteur du code peut faire : décider ce que sont les choses, et le dire simplement.

Carte existante : !`node ${CLAUDE_SKILL_DIR}/scripts/etat.mjs || true`
Arguments : $ARGUMENTS

## La langue : tout ce qui sera affiché s'écrit en français

C'est la règle qui compte le plus ici, parce que c'est toi qui décides si la carte sort en français.

**Tout ce que la personne verra** s'écrit **en français, en langage simple, en la tutoyant**, même si le code du projet, ses commentaires et ses noms de fichiers sont en anglais. Ça comprend :

- `sources/architecture.json` : `projet.summary`, et le `label`, le `summary` et le `details` de chaque partie ;
- `sources/descriptions/*.json` : les `name` et `description` de chaque fichier et de chaque adresse du serveur ;
- `.cache/travail-recent.json` : les `title`, `request`, `summary` et `note` ;
- `sources/plan.json` : les `name`, `description`, `assumptions`, `questions` ;
- la **visite guidée** (`visite`) et les **parcours** (`parcours`) : titres et notes ;
- les notes (`annotations`) et les libellés d'`edges` ;
- le **rapport** que tu fais à la personne à la fin.

Tu traduis le sens, pas les mots : ne laisse pas dans le texte des noms de fonctions anglais ni des phrases anglaises recopiées du code. **Restent tels quels** : les chemins de fichiers, les méthodes et les URL (`POST /api/orders`), les noms de produits (Stripe, Shopify, Postgres…), et les valeurs techniques qui servent de clés (`id`, `kind`, `"everyone"`, `"developers"`, etc.). Les clés du JSON ne se traduisent pas, sauf les trois clés de premier niveau d'`sources/architecture.json` qui s'appellent `projet`, `parcours` et `visite` (voir [references/schema.md](references/schema.md)).

Si `audience` vaut `"developers"`, le style devient plus technique, mais la langue reste le français.

## Rien n'est construit ? Dessine un plan

Si la personne veut préparer quelque chose qu'elle n'a pas encore construit (« voici mon cahier des charges », « je veux construire une appli qui… », une longue description d'un système), fais un **plan** : la même carte, prévue à partir de son document au lieu d'être lue dans le code. Prends ce chemin quand il n'y a pas encore de code pour ce système, même si le dossier contient d'autres choses. Si le code existe, fais une carte normale.

1. **Lis ce qu'on te donne.** Un fichier de cahier des charges, un message collé, ou un document qu'on t'indique. Ne pose que 2 ou 3 questions, et seulement si quelque chose de fondamental reste ouvert (qui s'en sert, web ou mobile, est-ce que quelqu'un se connecte, est-ce que de l'argent change de mains) ; sinon, décide et note-le comme hypothèse.
2. **Lis [references/plan.md](references/plan.md)**, puis [references/schema.md](references/schema.md) pour sources/architecture.json.
3. **Écris `la-carte/sources/plan.json`** : chaque fichier et chaque adresse du serveur prévus, ce que chaque écran appelle, quels services extérieurs et quelles données chaque partie utilise, qui peut utiliser chaque adresse, tes hypothèses et les questions ouvertes. Si le cahier des charges n'existe que dans la conversation, enregistre-le dans `docs/prd.md` et mets ce fichier en `source`, pour que la carte et les questions suivantes puissent s'y référer.
4. **Écris `la-carte/sources/architecture.json`** comme pour une carte de code (des parties, des nœuds `external` pour les services et les données que sources/plan.json nomme, 1 à 3 parcours pour les principaux scénarios du cahier des charges, une visite), avec des globs qui couvrent les chemins prévus. Langage simple pour tout le monde, comme à l'étape 4 plus bas.
5. **Lance `node ${CLAUDE_SKILL_DIR}/scripts/plan.mjs <racine>`, puis construire.mjs** (étape 5 plus bas). Corrige ce qu'ils signalent jusqu'à ce que les deux soient propres. Saute decrire.mjs et recents.mjs : les noms et les descriptions viennent de sources/plan.json. Le rapport du build indique `PLAN  prévu, pas encore construit`.
6. **Montre-le** avec ouvrir.mjs (étape 8).
7. **Fais le rapport** (à la place de celui de l'étape 8) : l'adresse ; la forme du système en 3 à 5 lignes ; la pile technique que tu as choisie ; tes principales hypothèses ; et les questions et avertissements de la revue du plan. Dis à la personne que chaque partie a un bouton **Construire ça avec Claude** pour obtenir une demande toute prête qui construit cette seule partie ; qu'elle peut passer la bulle de questions de la carte sur **Modifier** et demander des ajouts ou des changements (« prévois aussi les remboursements »), et que la carte se redessine en montrant ce qui a changé (le bouton **Résoudre sur la carte** de la revue du plan remplit lui-même une telle demande : les questions ouvertes n'attendent donc que leur réponse) ; que sources/plan.json et sources/architecture.json lui appartiennent, qu'elle peut les modifier ou te demander de les changer ; et que la carte reste en dehors de git.

Pour modifier un plan, édite sources/plan.json et sources/architecture.json puis lance `actualiser.mjs`, qui le redessine à partir de sources/plan.json. Quand le code existe et que la personne veut une carte de ce code, lance `actualiser.mjs <racine> --from-code`, puis continue comme pour une mise à jour. sources/plan.json reste où il est.

## Une carte existe déjà ? Mets-la à jour

Si l'état ci-dessus montre une carte existante, ne repars pas de zéro. Lance :

`node ${CLAUDE_SKILL_DIR}/scripts/actualiser.mjs <racine>`

Il relit le code, compare les empreintes de contenu avec le dernier build, et fait la comptabilité sans dépenser de jetons :
- il reporte les descriptions sur les fichiers et les adresses du serveur déplacés ou renommés ;
- il retire les entrées des fichiers supprimés ;
- il marque d'une note `review` les entrées dont les exports ou les adresses ont changé (les modifications à l'intérieur d'une fonction ne comptent pas) ; dans les fiches de describe, elles apparaissent comme `À REVOIR`, et les éléments jamais décrits comme `NOUVEAU` ;
- il reconstruit la carte ;
- il affiche ce qui a changé et une courte liste `ENSUITE`.

Fais seulement ce que `ENSUITE` demande :
- ajoute des globs pour les nouveaux dossiers qui se retrouvent dans « non affectés » ;
- lance decrire.mjs (étape 6), qui ne produit plus de fiches que pour les éléments `NOUVEAU` et `À REVOIR` ;
- vérifie les résumés des modules et les parcours si le changement était gros.

Une mise à jour typique après quelques heures de travail, c'est une poignée d'entrées de fiche. Ensuite, marque le travail récent (étape 7), puis montre la carte et fais le rapport (étape 8). Montre-la toujours, même si rien n'a changé : la personne a demandé à voir sa carte.

## Déroulé (première fois)

La racine du code est l'argument s'il y en a un, sinon le dossier courant. Ce peut être un seul dépôt, ou un simple dossier qui en contient plusieurs (écran + serveur + infrastructure, etc.). Le scan trouve chaque dépôt git sous la racine et ignore les copies de travail en double.

1. **Scanne.**
   `node ${CLAUDE_SKILL_DIR}/scripts/analyser.mjs <racine>`
   Il écrit `la-carte/.cache/analyse.json` et affiche un résumé : les dépôts, une arborescence du code avec le nombre de lignes, les points d'entrée, les liens d'import les plus lourds de dossier à dossier, les appels reliés à des adresses du serveur (y compris entre dépôts), les paquets et les hôtes extérieurs. Travaille à partir du résumé. Ne lis pas analyse.json, qui est gros.

2. **Lis le contrat.** Lis [references/schema.md](references/schema.md) (le format d'architecture.json) et [references/choisir-les-parties.md](references/choisir-les-parties.md) (comment découper un code pour obtenir une bonne carte).

3. **Explore juste assez.** Lis les README, les manifestes (package.json, pyproject, go.mod, docker-compose, configs de déploiement) et les points d'entrée, puis parcours 1 ou 2 fichiers par partie candidate, jusqu'à pouvoir écrire un résumé d'une phrase pour chacune. Tu cherches la forme du système, pas une revue de code.

4. **Écris `la-carte/sources/architecture.json`.** Vise :
   - pour chaque partie, un champ `icon` : l'icône qui dit ce que ce bloc est **dans ce projet** (un caddie pour un site de courses, un cadenas pour le mot de passe), choisie dans la liste de [references/schema.md](references/schema.md#icônes) ;
   - 3 à 9 nœuds de premier niveau ;
   - 3 à 12 enfants sous chaque gros nœud ;
   - des globs qui couvrent plus de 90 % des fichiers de code ;
   - des nœuds `external` pour les bases de données et les services tiers avec lesquels le code parle vraiment ;
   - des liens (`edges`) seulement pour ce que le scan ne voit pas (files d'attente, tâches planifiées, webhooks, appels entre services via des URL données par l'environnement) ;
   - 1 à 3 parcours (`parcours`) qui expliquent les principaux rôles du système ;
   - une `visite` : 3 à 8 étapes commentées pour la visite guidée « Commencer ici » (voir plus bas).

   Chaque nœud a besoin d'un `summary`.

   **Public.** Les gens qui ouvrent cette carte sont en général les propriétaires de l'appli, souvent des personnes qui ne sont pas développeuses et qui l'ont faite avec une IA. Sauf si la personne demande une carte pour développeurs, laisse `"audience"` absent ou mets `"everyone"`, et écris chaque `projet.summary`, chaque `label` et `summary` de nœud, et chaque description de fichier ou d'adresse du serveur **en français, en langage simple** (voir « Langage simple » dans references/ecrire-les-descriptions.md). Utilise des libellés courts comme « Serveur principal » plutôt que « API de la boutique (Flask) ». Les chemins, les méthodes et les URL restent visibles sur les blocs : les descriptions n'ont donc qu'à dire à quoi sert la chose.

   **Visite.** Ajoute `"visite": [{ "node": "<id de nœud ou chemin de fichier>", "title": "…", "note": "…" }]`, avec les étapes dans l'ordre où une personne qui arrive doit les voir : ce qu'est l'appli, les applis que les gens utilisent, le serveur principal, les services extérieurs, et pour finir le fichier d'un écran important. Écris les titres et les notes avec des mots simples, pour quelqu'un qui n'a jamais lu le code. Le premier parcours guidé est ajouté automatiquement à la fin, sous le titre « regarde une vraie demande passer ». Sans visite, on en construit une à partir des résumés des nœuds et du premier parcours : de bons résumés et au moins un parcours comptent donc.

5. **Construis et corrige.**
   `node ${CLAUDE_SKILL_DIR}/scripts/construire.mjs <racine>`
   Il valide tout et nomme chaque problème (« vouliez-vous dire … », fichiers non affectés par dossier, globs ambigus). La section `AFFECTATION` du rapport donne les `non affectés` et, dans le détail, les `non affectés, par dossier`. Corrige et reconstruis jusqu'à ce que ce soit propre et que les non affectés restent sous ~10 %.

   **Liens coupés.** L'analyse repère les fichiers et fonctions importés qui ont disparu et les appels à des adresses absentes. Si le build en signale, dis-le à la personne avec le fichier et la ligne : la carte les montre en rouge et le bouton Mettre à jour les retire une fois le code réparé. Ce bouton ne consomme pas de jetons.

   **Seul `la-carte/sources/` est à garder dans git.** La carte n'écrit rien hors de `la-carte/`. Son `.gitignore` ignore tout ce qui se refabrique (`index.html`, `.cache/`) et laisse `sources/` : les noms et descriptions, qui coûtent des jetons, suivent ainsi le projet dans un worktree ou sur un autre ordinateur. N'enregistre jamais toi-même : dis à la personne que `la-carte/sources/` est à ajouter à son prochain enregistrement. Si le build affiche une commande `git rm -r --cached` ou un avertissement DOCKER, transmets-les à la personne au lieu de les appliquer toi-même.

6. **Décris chaque fichier et chaque adresse du serveur.**
   `node ${CLAUDE_SKILL_DIR}/scripts/decrire.mjs <racine>`
   Il écrit une fiche de travail par module (`la-carte/.cache/worksheets/<clé>.md`) et un squelette à remplir (`la-carte/sources/descriptions/<clé>.json`). Chaque fiche contient un condensé de chaque fichier (docstrings, définitions, ce qu'il utilise et ce qui l'utilise) et de chaque adresse du serveur (gestionnaire, docstring), ce qui suffit pour décrire la plupart des fichiers sans les ouvrir.
   - Lis d'abord [references/ecrire-les-descriptions.md](references/ecrire-les-descriptions.md).
   - **Plus de ~150 fichiers :** répartis les fiches entre des sous-agents en parallèle si tu en as, ~100 à 150 fichiers chacun, groupés par domaine (adresses du serveur, services, scripts, tests, écrans). Donne à chacun les clés de ses fiches, la racine du code et le guide d'écriture, et dis-lui de ne modifier que ses propres fichiers `sources/descriptions/<clé>.json`, sans toucher aux clés, et **d'écrire en français, en langage simple, en tutoyant**.
   - **Codes plus petits :** fais-le toi-même.

   Puis reconstruis. Le build affiche `DESCRIPTIONS fichiers X/Y · routes X/Y`. Amène les deux à 100 % : relance decrire.mjs, il ne liste que ce qui manque encore.

7. **Marque le travail récent.** La carte met en avant ce sur quoi on vient de travailler : ces blocs reçoivent une étiquette verte « Modifié » ou « Nouveau », les parties qui les contiennent affichent « N modifié(s) », ta note apparaît au survol, et un bouton **Travail récent** les rassemble sur un seul tableau. Fais-le à chaque création et à chaque mise à jour, parce que ça remplace les mises en avant précédentes.
   `node ${CLAUDE_SKILL_DIR}/scripts/recents.mjs <racine>`
   Il liste ce qui a changé depuis la carte précédente, les modifications non validées et les derniers commits, chacun relié au bloc sous lequel il apparaît. Le *pourquoi*, c'est toi qui l'apportes :
   - **Ce qui compte.** Le travail fait dans cette conversation, par toi ou par tes sous-agents, est la source principale. Appuie-toi sur ce que tu en sais. Si tu n'as rien fait ici (nouvelle session), prends ce que recents.mjs montre comme clairement en cours : les modifications non validées et les derniers commits. S'il n'y a rien, écris `{ "tasks": [] }` pour effacer les anciennes mises en avant.
   - **Écris `la-carte/.cache/travail-recent.json`.** Une tâche par chose demandée par la personne : `title` (2 à 5 mots), `request` (ce qu'elle a demandé, avec ses mots, raccourci), `summary` (1 à 2 phrases sur ce qui a été fait pour y répondre et où ça en est, y compris ce qui a été supprimé, puisque les fichiers supprimés ne peuvent pas être mis en avant). Ajoute ensuite des `items` : les blocs qui ont changé, comme un chemin de fichier, un id de nœud ou `"METHODE /chemin"`, avec `change` (`"new"` ou `"changed"`) et une `note`.
   - **Chaque note répond à « quel rapport avec ce qu'elle a demandé ? »** En une ou deux phrases simples, dis ce qui a changé sur ce bloc et pourquoi la demande en avait besoin. Par exemple : « Repère maintenant les appels au serveur dont l'adresse est d'abord construite dans une variable, ce qui explique pourquoi les écrans des commandes et du stock n'affichaient aucun appel. » Et non « Ajout des helpers flattenTemplates et variableUse ».
   - **Mets en avant ce qui a compté.** Choisis les fichiers et les adresses du serveur dont le comportement a changé pour cette demande, en général 3 à 15. Laisse de côté les tests et les retouches au passage, sauf si c'est le sujet. Un fichier dont une adresse a changé peut lister le fichier et l'adresse.
   - **Garde les mots du code de côté, sauf si le public est composé de développeurs.** Ne mets jamais de secret dans les notes.

   Format : [references/schema.md#travail-récent](references/schema.md#travail-récent). Puis lance construire.mjs. Il affiche `TRAVAIL RÉCENT  N bloc(s) mis en avant` et signale les références qui ne sont pas sur la carte.

8. **Montre-la, puis fais le rapport.** Chaque fois que tu crées ou mets à jour une carte, termine en la mettant sous les yeux de la personne :
   `node ${CLAUDE_SKILL_DIR}/scripts/ouvrir.mjs <racine>`
   - Il démarre en arrière-plan le serveur de la carte (ou réutilise celui qui tourne déjà pour cette carte) et l'ouvre dans le navigateur. Les onglets déjà ouverts se rechargent sur place au lieu d'en ouvrir un nouveau.
   - Il affiche l'adresse, si Demander fonctionne (la CLI Claude Code a été trouvée) et comment arrêter le serveur. Le serveur s'arrête aussi tout seul environ deux heures après la fermeture du dernier onglet.
   - Si tu as un navigateur intégré ou un outil d'aperçu, passe `--no-open` et ouvre l'adresse affichée dedans, pour que la carte apparaisse juste à côté de la conversation.
   - Si c'est une machine distante ou sans écran où la personne ne peut pas joindre 127.0.0.1, saute ouvrir.mjs et dis-lui de lancer `node la-carte/.cache/serveur.mjs` sur sa propre machine, ou propose la voie de l'appli Claude (étape 9).

   Ensuite, **fais le rapport.** Donne l'adresse, puis décris en 3 à 5 lignes l'architecture que tu as cartographiée, **en français, en langage simple, en tutoyant la personne**, avec tout ce qui surprend : cycles, fichiers énormes qui font tout, zones mortes, parties trop liées entre elles. Mentionne toujours les **problèmes de Santé de gravité haute** (`graph.sante` ; le build et .cache/graphe.json les listent). Des mots de passe ou des clés écrits en dur et des adresses du serveur par lesquelles n'importe qui peut modifier des données, la personne a besoin de les savoir. Ne répète jamais la valeur d'un secret. Dis que `sources/architecture.json` et `sources/descriptions/` lui appartiennent et qu'elle peut les modifier, et qu'après d'autres travaux elle peut simplement demander de « mettre à jour la carte », ce qui ne relit que ce qui a changé. Donne-lui ces mots simples plutôt qu'une commande : la commande du plugin est `/la-carte:la-carte` (`/la-carte` comme skill personnel). À la première fois, dis en une ligne que la carte reste en dehors de git. Lors d'une mise à jour, commence par ce qui a changé pour ce que la personne avait demandé (c'est mis en avant sous **Travail récent**).

## 9. Ouvrir la carte et poser des questions

La carte a une bulle de questions flottante. La personne tape une question, et Claude répond par du texte et un tableau de réponse : les blocs concernés, les liens entre eux, une note sur chaque bloc, et en option une visite pas à pas. Il y a deux façons de l'alimenter. L'interface est la même dans les deux cas.

- **Claude Code en ligne de commande (le mieux).** Le serveur de la carte (`la-carte/.cache/serveur.mjs`, démarré par ouvrir.mjs à l'étape 8) la sert sur http://127.0.0.1:4378, ou sur le port libre suivant. Chaque question tourne avec la connexion de la personne, dans le code, en lecture seule, et les réponses peuvent donc citer du vrai code : `claude -p` avec la carte (via `la-carte/.cache/requete.mjs`) et Read/Grep/Glob sur les sources. Le serveur trouve `claude` dans le PATH ou dans `~/.local/bin`.

  `--claude <chemin>` indique une installation inhabituelle, et `--model <nom>` choisit le modèle (ouvrir.mjs transmet les deux). La personne peut aussi lancer `node la-carte/.cache/serveur.mjs` elle-même à tout moment, et arrêter un serveur en arrière-plan avec `node la-carte/.cache/serveur.mjs --stop`.
- **Appli Claude.** Si tu tournes dans l'appli Claude (l'outil Artifact est disponible), propose de publier la carte pour qu'elle l'ouvre là et pose ses questions avec son propre compte Claude. Les réponses viennent alors de la carte seule (noms, descriptions, liens, adresses du serveur), pas des sources, et la bulle de questions affiche un conseil d'installer le CLI pour un meilleur résultat. Pour publier :
  1. `node ${CLAUDE_SKILL_DIR}/scripts/construire.mjs <racine> --artifact`. Ça écrit `la-carte/artifact.html` sans le chemin absolu de la machine.
  2. Publie ce fichier avec l'outil Artifact, `capabilities: {"sample": {}}`, et garde le même chemin de fichier pour les publications suivantes afin que l'adresse reste stable.
  3. Après chaque mise à jour, reconstruis avec `--artifact` et republie.

  Publier envoie la carte (chemins, noms, descriptions, structure), pas le code source, vers son compte claude.ai privé. Dis-le avant de le faire.
- **Aucun des deux :** `la-carte/index.html` s'ouvre quand même directement dans un navigateur. La bulle de questions explique ce qu'il faut.

### Partager une copie

Quand la personne veut envoyer la carte à quelqu'un (un collègue, un client, quelqu'un sans Claude), exporte-la. Un export est le même fichier HTML unique, sans la bulle de questions, sans les demandes pour Claude, sans les liens vers l'éditeur, sans le chemin du dossier de cette machine ni les dépôts git distants. Le bouton **Exporter** de la carte le fait depuis le navigateur ; d'ici, lance :

```
node la-carte/.cache/serveur.mjs --export [<fichier>] [--include flows,notes,recent,health]
```

Il écrit `la-carte/<projet>-carte.html` si aucun fichier n'est donné. `--include` vaut par défaut `flows,notes` (les parcours et la visite, les notes épinglées sur les fichiers) ; `recent` ajoute le travail récent et `health` ajoute le contrôle de santé, ou la revue du plan pour un plan. Laisse la santé de côté sauf si la personne la demande, et si elle la demande, dis que ça liste les adresses du serveur que n'importe qui peut utiliser et les endroits du code où se trouvent des secrets (jamais leurs valeurs) : elle ne doit donc l'envoyer qu'à des gens de confiance. Tout export montre comment l'appli est construite (chaque partie, fichier et adresse du serveur, avec noms et descriptions), mais pas le code source.

### Ce que la carte apporte en plus (automatique)

- **Santé.** Un bouton dans l'en-tête, avec le nombre de problèmes importants, ouvre une liste en langage simple des soucis que le scan a trouvés :
  - mots de passe et clés d'API écrits dans le code ou dans un `.env` versionné ;
  - clés secrètes dans des variables que le navigateur reçoit (`NEXT_PUBLIC_`, `VITE_` et leurs semblables) ;
  - tables Supabase sans sécurité au niveau des lignes (row-level security), et règles qui laissent n'importe qui modifier une table (d'après les migrations SQL) ;
  - règles Firebase (Firestore, Storage, Realtime Database) qui laissent entrer tout le monde, y compris le mode test et sa date d'expiration ;
  - webhooks Stripe qui agissent sur des événements sans vérifier la signature de Stripe ;
  - CORS qui autorise tous les sites (à corriger quand des identifiants circulent avec) ;
  - adresses du serveur qui laissent n'importe qui modifier ou lire des données sans être connecté (y compris une vérification de connexion placée au-dessus de la ligne de la route) ;
  - fichiers que rien n'utilise ;
  - fichiers de plus de ~1 000 lignes, que l'IA a du mal à modifier sans risque.

  Chaque problème a **Voir sur la carte** (met en avant les fichiers et les adresses concernés, avec des notes) et **Corriger avec Claude** (une demande toute prête à coller, qui nomme les fichiers et les lignes exacts et la correction sûre). C'est calculé par `scripts/lib/sante.mjs` pendant le scan et le build, et ça ne stocke jamais les valeurs des secrets, seulement le fichier, la ligne et un indice masqué.

  **La santé est un contrôle rapide et automatique, avec de fausses alertes : ce n'est pas un audit de sécurité.** Ne la présente jamais autrement à la personne : dis « contrôle rapide » (jamais « audit », « diagnostic de sécurité » ou « l'appli est sûre »), rappelle qu'un problème listé peut être une fausse alerte (elle peut le marquer **Pas un problème**) et que l'absence de problème ne prouve pas que tout va bien.
- **Écrans.** Le build détecte les écrans de l'appli (Next.js, React Router, Vue, SvelteKit, Remix, Nuxt, Astro, Expo, Angular, TanStack) avec `scripts/lib/ecrans.mjs`. Il repère aussi ce qu'il y a derrière chacun : ses composants, les appels au serveur qu'il fait, le code serveur et les données qui y répondent, et les services extérieurs. Un bouton **Écrans** permet de partir de la page que les gens connaissent.
- **Commencer ici.** Une visite d'une minute se lance à la première ouverture et peut être rejouée depuis l'en-tête. Elle utilise ta `visite`, ou en construit une automatiquement.
- **Des mots simples par défaut.** Les types de liens se lisent « Utilise », « Appels au serveur », « Tâches de fond ». Les termes techniques courants sont soulignés et expliqués au survol. **Filtres → Détail technique** passe aux termes de développeur et montre les exports.

La personne peut aussi utiliser **Parcours → Demander un nouveau parcours** pour que Claude suive quelque chose (« comment un remboursement revient-il sur la carte bancaire du client ? ») et en fasse un parcours pas à pas. Avec serveur.mjs, ces parcours sont enregistrés dans `la-carte/sources/parcours-perso.json`, et chaque build les intègre à la carte (les étapes qui pointent vers du code supprimé sont retirées, avec un avertissement). Traite ce fichier comme le contenu de la personne : garde-le lors d'une mise à jour et ne le modifie pas sans qu'on te le demande.

## Notes

- Les chemins sont relatifs à la racine du code et utilisent des barres obliques. Dans une racine à plusieurs dépôts, ils commencent par le dossier du dépôt, par exemple `api-service/src/**`.
- Les clés d'adresses du serveur dans les descriptions sont `"METHODE /chemin/complet"` exactement comme la fiche de travail les affiche.
- La carte ne fait aucune requête vers l'extérieur : le build intègre le moteur de mise en page (ELK) et les polices depuis `${CLAUDE_SKILL_DIR}/assets/vendor/`, elle marche donc hors ligne.
- Les liens HTTP viennent de la mise en correspondance des URL écrites aux endroits d'appel (y compris les URL gardées d'abord dans une variable, les gabarits de chaînes imbriqués et les petites fonctions d'un même fichier qui ajoutent un préfixe) avec les définitions de routes (Flask, FastAPI, Express, Fastify, Next.js, Spring, Go et d'autres), en résolvant les préfixes de blueprint, de routeur et de plugin, montages imbriqués compris. Les fonctions appelables Firebase sont reliées par leur nom (`CALL /<nom>`, d'après `httpsCallable`) et les fonctions `onRequest` par leur URL ; la section FIREBASE FUNCTIONS du résumé liste les fonctions planifiées ou déclenchées par un événement, qui vont dans un nœud `worker`. Prends-les comme de forts indices. Si un lien important entre deux services manque, ajoute-le comme lien explicite.
- Ne modifie pas à la main .cache/graphe.json ni index.html : ils sont régénérés à chaque build.
