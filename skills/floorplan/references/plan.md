# Plans : la carte d'un système qui n'est pas encore construit

Un plan est la même carte, dessinée à partir d'un projet au lieu du code. Quelqu'un a un cahier des charges, une spécification ou simplement une longue description de ce qu'il veut construire, et la carte montre chaque pièce nécessaire, comment elles se relient, ce sur quoi s'appuie chaque écran, et ce qu'il reste à décider.

**Langue.** Tout ce que la personne verra (noms, descriptions, hypothèses, questions, résumés, parcours, visite, rapport) s'écrit **en français, en langage simple, en tutoyant**, même si le cahier des charges est en anglais. Les chemins, les méthodes et les URL restent tels quels, et les clés JSON ne se traduisent pas (sauf `projet`, `parcours` et `visite` dans architecture.json).

Tu écris deux fichiers dans `floorplan/` :
- `plan.json` : les fichiers, les adresses du serveur et les liens que le système aurait (ce fichier).
- `architecture.json` : les parties, les services extérieurs, les parcours et la visite, exactement comme pour une carte de code ([schema.md](schema.md)).

`plan.mjs` transforme `plan.json` en le scan que `construire.mjs` attend, et tout ce qui suit marche donc comme pour du vrai code. Les blocs sont dessinés avec un contour en pointillés et une étiquette **Plan**, la Santé devient une **revue du plan**, et chaque partie a un bouton **Construire avec Claude** (ou Codex) avec une demande toute prête pour la construire. Dans graphe.json, le plan est rangé sous la clé `ebauche` (graphe.json est généré : n'y touche pas).

Sommaire : [Bien planifier](#bien-planifier) · [plan.json](#planjson) · [Contrôles](#ce-que-la-revue-du-plan-contrôle)

## Bien planifier

- **Planifie jusqu'au niveau des fichiers et des adresses du serveur**, pas seulement des boîtes. Les écrans, la revue du plan et les demandes de construction en dépendent. Un petit produit, c'est en général 15 à 60 fichiers et 10 à 40 adresses du serveur. Ne planifie pas chaque fonction utilitaire : un fichier par page, par groupe d'adresses du serveur, par service extérieur et par sorte de données enregistrées, c'est à peu près bien. Là où la pile met un gestionnaire par URL (Next.js `route.ts`, SvelteKit `+server.ts`), planifie-le ainsi ; plus de fichiers, c'est très bien.
- **Choisis une pile raisonnable et courante** sauf si le cahier des charges en nomme une, et note-la dans `stack`. Préfère ce que choisirait une personne qui construit seule avec une IA : un site Next.js ou React, un serveur Node ou Python, Postgres, Stripe, un service d'e-mails hébergé. Utilise de vrais chemins conventionnels pour cette pile (`web/app/checkout/page.tsx`, `api/src/routes/orders.ts`).
- **Chaque écran décrit par le cahier des charges est un fichier avec une URL `screen`.** Donne à chaque écran des `calls` pour les adresses du serveur qu'il utilise et des `uses` pour les parties dont il est fait.
- **Chaque adresse du serveur a un `access`**, et un `who` quand seules certaines personnes connectées peuvent l'utiliser (« les responsables de ce site », « le propriétaire du compte »). Décide-le d'après le cahier des charges. S'il n'en dit rien et que ça compte, laisse-le de côté (la revue le signalera) ou ajoute une question. Une adresse qui doit être ouverte à tous et qui modifie des données (codes de connexion, inscription, commande sans compte) reçoit un `publicBecause` : pourquoi, et ce qui empêche les abus.
- **N'invente pas d'exigences.** Quand le cahier des charges ne dit rien et que tu as dû choisir, écris ton choix dans `assumptions`. Quand la réponse change ce qui sera construit et que tu ne peux pas raisonnablement choisir, ajoute-la à `questions` avec les parties concernées. Reporte dans `questions` chaque question ouverte que le cahier des charges liste, sauf s'il la tranche ailleurs ; si tu as planifié autour de la réponse probable, dis-le aussi dans `assumptions`. Ne pose à la personne 2 ou 3 questions au départ que si le cahier des charges laisse ouvert quelque chose de fondamental (qui s'en sert, web ou mobile, est-ce que quelqu'un se connecte, est-ce que de l'argent change de mains).
- **Les services extérieurs et les lieux de stockage des données sont des nœuds `external`** dans architecture.json (Stripe, la base de données, un service d'e-mails). Les fichiers les atteignent par `services` et `data` dans plan.json. Mets `data` sur les fichiers qui parlent directement à la base (un utilitaire de base de données, ou chaque fichier d'accès aux données), pas sur tous ceux qui s'en servent : les Écrans suivent `uses` jusqu'à eux.
- **Les tâches de fond** (e-mails planifiés, tâches de nuit, travailleurs de file d'attente) reçoivent leurs propres fichiers et un nœud `worker`.

## plan.json

```json
{
  "$schema": "floorplan/plan@1",
  "source": "docs/prd.md",
  "stack": ["Site Next.js", "Serveur Node.js + Express", "Postgres", "Stripe"],
  "assumptions": ["Le personnel et les clients se connectent au même endroit, le personnel étant repéré à part."],
  "questions": [{ "question": "Les clients peuvent-ils annuler gratuitement ?", "about": ["POST /api/orders/:id/cancel"] }],
  "files": [ { "path": "web/app/checkout/page.tsx", "name": "Page de paiement", "description": "…", "screen": "/checkout", "uses": ["web/lib/api.ts"], "calls": ["POST /api/orders"] } ],
  "endpoints": [ { "method": "POST", "path": "/api/orders", "file": "api/src/routes/orders.ts", "name": "Passer une commande", "description": "…", "access": "signed-in" } ]
}
```

| champ | sens |
|---|---|
| `source` | à partir de quoi c'est planifié : le chemin du cahier des charges dans le projet, ou quelques mots comme « une description dans la conversation » |
| `stack` | les choix techniques, en mots simples |
| `assumptions` | les choix que tu as faits là où le cahier des charges ne disait rien. Affichés dans la vue d'ensemble de la carte |
| `questions` | `{ question, about }` : les décisions que le cahier des charges laisse ouvertes. `about` liste des ids de nœuds, des chemins de fichiers ou des `"METHODE /chemin"`. Chacune s'affiche dans la revue du plan jusqu'à ce qu'on y réponde et qu'on la retire |
| `files` | chaque fichier prévu (voir plus bas) |
| `endpoints` | chaque adresse du serveur prévue (voir plus bas) |

**files[]**

| champ | sens |
|---|---|
| `path` | où il serait rangé, relatif au dossier du projet. Obligatoire, unique |
| `name`, `description` | un nom lisible et une phrase simple, écrits comme la description de vrai code ([ecrire-les-descriptions.md](ecrire-les-descriptions.md)) |
| `screen` | pour une page que les gens ouvrent : son URL (`/checkout`, `/orders/:id`). En fait un écran dans **Écrans** |
| `uses` | les autres fichiers prévus dont il est fait ou qu'il appelle directement (devient des liens « utilise ») |
| `calls` | les adresses du serveur qu'il appelle, sous la forme `"METHODE /chemin"`, exactement comme dans `endpoints` |
| `services` | ids des nœuds `external` avec lesquels il parle (Stripe, un service d'e-mails) |
| `data` | ids des nœuds des lieux de données qu'il lit ou écrit (en général la base de données) |

**endpoints[]**

| champ | sens |
|---|---|
| `method` | GET, POST, PUT, PATCH, DELETE, ou CALL pour une fonction appelable (par exemple Firebase `onCall`) |
| `path` | l'URL, qui commence par `/`. Utilise `:nom` pour les parties qui changent (`/api/orders/:id`) |
| `file` | le fichier prévu qui la traite. Obligatoire |
| `name`, `description` | comme pour les fichiers |
| `access` | qui peut l'utiliser : `public` (tout le monde), `signed-in` (connecté), `team` (seulement les gens qui font tourner le service, pour ses propres pages d'administration, pas les utilisateurs de l'appli), `webhook` (le service d'une autre entreprise, qui doit prouver que c'est bien lui) ou `internal` (seulement tes propres services) |
| `who` | avec `signed-in` : quelles personnes connectées, en quelques mots (« les responsables de ce site », « le propriétaire du compte »). Laisse-le de côté quand n'importe quel utilisateur connecté peut |
| `publicBecause` | avec `public` : pourquoi elle doit être ouverte, et ce qui limite les abus (« la connexion doit marcher avant que quiconque soit connecté ; 5 codes par numéro et par heure »). La revue du plan cesse de signaler une adresse ouverte qui en a un |

Les globs `paths` des nœuds d'architecture.json affectent les fichiers prévus aux parties, comme pour du code. Vise zéro fichier non affecté. Les noms de dossiers entre crochets (`app/orders/[id]/**`) correspondent littéralement.

Les « appels à des adresses prévues » de plan.mjs comptent chaque appel ; les liens « http » du build comptent chaque lien d'un appelant vers un fichier, plus les liens vers les services extérieurs : les deux nombres diffèrent donc.

## Changements depuis la carte

Quand la carte est ouverte par son serveur (ouvrir.mjs), la bulle de questions a un sélecteur **Demander / Modifier**. Une demande de changement (« prévois aussi les remboursements », « enlève la page d'administration ») va au même agent, en lecture seule. Il répond avec le plan.json et l'architecture.json complets et mis à jour, et le serveur les vérifie avec plan.mjs et construire.mjs. Si les contrôles échouent, ou si de nouveaux fichiers ne tombent sous aucune partie, il renvoie les problèmes une fois. Ensuite il enregistre les fichiers, redessine la carte (les onglets ouverts se rechargent) et met en avant les blocs nouveaux et modifiés comme travail récent, avec **Annuler**. Les fichiers remplacés sont gardés dans `floorplan/.cache/history/`. Chaque élément de la revue du plan a **Résoudre sur la carte**, qui place une demande toute prête en mode Modifier : la demande d'une question ouverte se termine par « Ma réponse : » que la personne complète, et l'agent retire alors la question et intègre la réponse au plan. Les changements que tu fais à la main ou par ce skill marchent de la même façon : modifie les fichiers et lance actualiser.mjs.

## Ce que la revue du plan contrôle

- les adresses du serveur qui modifient des données et sont ouvertes à tous, sauf si `publicBecause` l'explique ;
- les adresses du serveur dont l'`access` n'est pas décidé ;
- chaque question ouverte, avec les parties qu'elle touche ;
- les adresses du serveur qu'aucun écran ni service prévu n'appelle ;
- les fichiers prévus qui ne sont reliés à rien.

Chacun a **Résoudre sur la carte** quand la carte est servie (voir plus haut), et sinon **Résoudre avec Claude/Codex**, une demande à coller dans l'agent.

Rappel : la revue du plan, comme la Santé d'une carte de code, est un contrôle rapide avec de fausses alertes, pas un audit. Ne la présente pas autrement.
