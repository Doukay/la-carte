# Confidentialité et sécurité

Cette page dit ce qui est vrai pour cette copie française de Floorplan, y compris ses limites. Pour ce que le plugin peut et ne peut pas faire sur ton ordinateur (pas de crochets, pas de serveurs MCP, pas de dépendances, pas de téléchargements), voir [Est-ce sûr à installer ?](est-ce-sur.md).

## Ce qui sort de ta machine, en bref

1. **Ton code part chez Anthropic (ou OpenAI avec Codex).** La carte fonctionne parce que Claude ou Codex lit ton code pour le décrire. Ce qu'il lit est envoyé à Anthropic (ou OpenAI) sur ton compte, selon leurs conditions, comme pour n'importe quelle tâche que tu leur donnes. La carte ne peut pas l'éviter.
2. **La bulle de questions de la carte lit tes fichiers**, à l'exception des fichiers de secrets avec Claude Code (voir plus bas). Ce qu'elle lit part au même endroit.
3. **La carte elle-même n'envoie rien** : pas de statistiques, pas de suivi, pas de signalement, pas de liste d'attente, aucun appel à un serveur de l'auteur ni de la personne qui tient cette copie.

## Ce qui tourne où

| Partie | Où elle tourne | Ce qu'elle envoie |
|---|---|---|
| Analyse, construction, mises à jour | ton ordinateur (Node.js) | rien |
| Écriture des noms et descriptions | Claude ou Codex, dans ta session | les fichiers qu'il lit, comme pour n'importe quelle autre tâche que tu lui donnes |
| La carte | ton navigateur | rien. Son moteur de mise en page et ses polices sont intégrés au fichier, elle marche donc hors connexion |
| Le serveur de la carte (`serveur.mjs`) | ton ordinateur, à l'écoute sur `127.0.0.1` seulement | rien de lui-même |
| Poser des questions (ligne de commande de Claude Code) | une session `claude -p` sur ton ordinateur, avec ton compte | ta question, et les fichiers que Claude choisit de lire |
| Poser des questions (Codex) | une exécution `codex exec` sur ton ordinateur, avec ta connexion ChatGPT, non gardée dans ton historique Codex | ta question, et les fichiers que Codex choisit de lire |
| Modifier un plan depuis la carte | comme poser des questions, avec Claude Code ou Codex ; le serveur de la carte n'écrit alors que les fichiers du plan dans `la-carte/` | ta demande, et les fichiers que l'IA choisit de lire |
| Poser des questions (application Claude) | ton compte claude.ai | la carte (noms, descriptions, structure), jamais ton code source. Claude te demande avant de la publier là |
| Exporter une copie | ton ordinateur : le serveur de la carte écrit un seul fichier HTML | rien. C'est toi qui décides à qui va le fichier. Il contient la carte, plus la Santé ou le travail récent seulement si tu les coches, et jamais le chemin de ton dossier, tes dépôts Git distants ni ton code source |

Il n'y a aucune ligne « service de la carte » dans ce tableau, parce qu'il n'y en a aucun. Le moteur de mise en page ([elkjs](https://github.com/kieler/elkjs) 0.9.3, EPL-2.0) et les polices (Inter et JetBrains Mono, licence SIL Open Font) sont intégrés dans `skills/la-carte/assets/vendor/` avec leurs licences, et chaque construction les copie dans la carte. Les quelques liens de la carte vers de la documentation s'ouvrent seulement quand tu cliques dessus.

Ce que Claude Code et Codex gardent de leur côté (historique des conversations, journaux) dépend d'eux et de tes réglages, pas de la carte. Les questions posées par la carte avec Codex sont lancées sans sauvegarde dans l'historique ; pour Claude Code, regarde ses propres réglages.

## Le serveur local

- Il écoute sur `127.0.0.1` seulement, donc les autres machines de ton réseau ne peuvent pas l'atteindre.
- Chaque démarrage crée un jeton aléatoire, que seule la page de la carte qu'il sert reçoit. Poser des questions et enregistrer des parcours demandent ce jeton, et ces demandes sont refusées quand elles viennent d'un autre site web.
- Il ne répond qu'à `127.0.0.1` et à `localhost` sur son propre port, donc un site web qui fait pointer son propre nom de domaine vers ton ordinateur (le « rebond DNS ») ne peut ni charger la carte ni son jeton.
- Avec Claude Code, les questions lancent Claude avec des outils **en lecture seule** : lire des fichiers, chercher, et le script de recherche de la carte. Il ne peut ni modifier de fichiers ni lancer d'autres commandes.
- Avec Codex, les questions tournent dans le bac à sable **en lecture seule** de Codex : il peut lire et chercher, mais pas écrire de fichiers.
- Sur un plan (une carte prévue à partir d'un cahier des charges), les demandes **Modifier** tournent de la même façon, en lecture seule. L'agent répond avec le plan mis à jour, et c'est le serveur lui-même qui écrit uniquement `la-carte/sources/plan.json`, `la-carte/sources/architecture.json` et `la-carte/.cache/travail-recent.json`, après les avoir vérifiés et gardé les anciennes copies pour Annuler.
- Il s'arrête tout seul deux heures après la fermeture du dernier onglet, et `node la-carte/.cache/serveur.mjs --stop` l'arrête tout de suite.

Limite honnête : n'importe quel programme qui tourne sur ton ordinateur avec ton compte peut aussi se connecter à `127.0.0.1`. La protection par jeton et par nom d'hôte vise les pages web et les autres machines, pas un programme malveillant déjà installé chez toi.

## La bulle de questions et les fichiers de secrets

Pour limiter ce que la bulle de questions envoie, cette version fait deux choses avec Claude Code :

- **Elle lui interdit d'ouvrir les fichiers de secrets** : `.env`, `.env.*`, `*.pem`, `*.key` (et aussi `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`, les dossiers `.ssh` et `.aws`), et tout fichier dont le nom contient `secret`, `token` ou `credential`.
- **Elle ne charge pas les serveurs MCP de ta machine.** Claude est lancé avec une liste de serveurs MCP vide, donc aucun outil branché chez toi (agenda, base de données, messagerie…) n'est disponible pour répondre à une question de la carte.

Les limites, honnêtement :

- **Tout le reste est lisible.** La bulle de questions lit les fichiers de ton projet pour répondre. La liste ci-dessus est une liste de noms : un secret écrit dans un fichier au nom banal (`config.json`, `settings.py`) ou directement dans le code n'est pas protégé, et sera envoyé si Claude ouvre ce fichier.
- **Avec Codex, ce blocage n'existe pas.** Codex lit en lecture seule, mais sans la liste ci-dessus. Si des fichiers de secrets sont dans ton projet, préfère Claude Code pour la bulle de questions, ou ne pose pas de questions avec Codex sur ce projet.
- Cette protection vient des réglages de la ligne de commande de Claude Code : si elle change sa façon de les appliquer, il faut la revérifier.

## Le contrôle de santé et les secrets

Le contrôle de santé cherche dans ton code des mots de passe, des clés d'API et des clés privées, et des fichiers `.env` qui seraient enregistrés dans Git. Quand il en trouve un, il enregistre seulement le fichier, la ligne, le genre de secret et **la longueur** de la valeur, par exemple « 20 caractères ». **Il ne garde aucun caractère de la clé elle-même** (pas même le début), et un mot de passe écrit dans une adresse (`https://nom:mot-de-passe@site`) est retiré du nom du site. **Les valeurs des secrets ne sont jamais enregistrées dans la carte, affichées ni envoyées par la carte**, et on demande à Claude de ne jamais les répéter.

Mais, honnêtement :

- **Il donne des fausses alertes** : il lit des motifs dans le code, pas le sens. C'est pour ça que le bouton **Pas un problème** existe (il reste sur ta machine).
- **Il laisse passer des choses.** Un « rien trouvé » ne veut pas dire « sûr ».
- **Ce n'est pas un audit de sécurité.** C'est une première passe utile. Pour une appli qui compte, fais-la relire par quelqu'un.
- Pour trouver un secret, la carte doit lire le fichier qui le contient. Cette lecture se fait en local, mais si Claude lit ensuite ce fichier pour décrire ton code, son contenu part chez Anthropic comme le reste (voir plus haut).

## Git

Rien de ce que la carte crée n'est enregistré dans Git. Voir [Ce qu'il y a dans ton projet](fichiers-du-projet.md#rester-hors-de-git).

## Signaler une faille

Signale les problèmes de sécurité en privé, comme décrit dans [SECURITY.md](../SECURITY.md), plutôt que dans un ticket public.
