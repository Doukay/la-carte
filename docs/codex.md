# La carte dans Codex

La carte marche dans [Codex](https://developers.openai.com/codex) comme dans Claude Code : la même compétence, les mêmes scripts et la même carte, avec ta propre connexion ChatGPT. Il n'y a aucune clé d'API à régler.

## Ce qu'il te faut

- Codex : l'application de bureau ou la ligne de commande, connecté avec ton compte ChatGPT.
- [Node.js](https://nodejs.org) 18 ou plus.

## Installation

Cette copie n'est pas dans une boutique de plugins : tu l'installes depuis son dossier sur ta machine ou depuis son dépôt Git. Le plugin et la source s'appellent tous deux `la-carte`.

**Dans l'application Codex** (pas besoin de terminal) :

1. Ouvre **Plugins** et choisis **Add a marketplace**.
2. Pour **Source**, entre le chemin du dossier de cette copie (ou l'adresse de son dépôt Git, si ton Git y a accès). Laisse **Git ref** vide, et clique sur **Add marketplace**.
3. Trouve **La carte** dans la liste et clique sur **+** pour l'installer.
4. Ouvre une nouvelle discussion.

**Depuis un terminal**, avec la [ligne de commande de Codex](https://developers.openai.com/codex/cli) :

```bash
codex plugin marketplace add /chemin/vers/la-carte
codex plugin add la-carte@la-carte
```

L'application et la ligne de commande partagent leurs plugins, donc l'installer dans l'une rend la carte disponible dans les deux.

## Fais ta première carte

Ouvre ton projet dans Codex et demande avec tes mots :

> Dessine-moi une carte de ce code

Pour appeler la compétence par son nom, tape `$la-carte`. Ensuite, tout est comme dans Claude Code ([Pour commencer](bien-demarrer.md#fais-ta-première-carte)) : Codex analyse le code, décrit chaque partie, fichier et appel au serveur, construit la carte et l'ouvre. Plus tard, « mets à jour la carte » ne relit que ce qui a changé.

Quand Codex ouvre la carte, il demande à lancer le serveur de la carte hors de son bac à sable. Le serveur doit continuer à tourner après la fin de la commande, et la bulle de questions doit pouvoir joindre Codex. Si tu préfères ne pas l'autoriser, lance le serveur toi-même depuis le dossier du projet :

```bash
node la-carte/serveur.mjs
```

## Poser des questions sur la carte

La bulle de questions de la carte lance ton propre Codex sur ton ordinateur : `codex exec` dans le bac à sable **en lecture seule** de Codex, dans le dossier de ton projet, avec ta connexion ChatGPT. Il lit la carte et ton code source pour répondre, et ne peut modifier aucun fichier. Ces exécutions ne sont pas gardées dans ton historique Codex ; une question de suite emmène avec elle les dernières questions et réponses.

**Limite à connaître :** avec Codex, la bulle de questions peut lire n'importe quel fichier lisible du projet, **fichiers de secrets compris** (`.env`, clés…). Le blocage de ces fichiers que cette version met en place avec Claude Code n'existe pas côté Codex. Ce que Codex lit part chez OpenAI. Sur un projet qui contient des secrets en clair, préfère Claude Code pour poser des questions. Voir [Confidentialité et sécurité](confidentialite-et-securite.md).

Le serveur utilise l'agent qui a fait la carte, et passe à l'autre si celui-là n'est pas installé. Pour choisir :

```bash
node la-carte/serveur.mjs --engine codex
```

Il trouve `codex` dans ton PATH, et sous Windows la ligne de commande qui vient avec l'application de bureau Codex. Si la tienne est ailleurs, passe `--codex /chemin/vers/codex`. `--model <nom>` choisit le modèle ; sinon tes réglages Codex décident.

## Ce qui change par rapport à Claude Code

- **Pas de fichier de notes.** Cette copie n'écrit jamais dans tes fichiers de notes (ni `CLAUDE.local.md` pour Claude Code, ni `AGENTS.md` pour Codex) : elle n'écrit que dans `la-carte/`. Pour que tes sessions pensent à la carte, ajoute toi-même une ligne dans tes notes.
- **Pas d'application Claude.** Publier la carte dans l'application Claude est une fonction de Claude. Dans Codex, la carte s'ouvre dans ton navigateur, servie depuis ton ordinateur.
- **« Corriger avec Codex ».** Les demandes de correction toutes prêtes du panneau Santé sont à coller dans Codex. Sur un [plan](bien-demarrer.md#planifier-une-appli-pas-encore-construite), c'est pareil pour **Construire ça avec Codex**, et l'interrupteur **Modifier** de la bulle de questions lance aussi Codex dans son bac à sable en lecture seule : Codex répond avec le plan mis à jour, et le serveur de la carte l'enregistre.

## Mettre à jour ou retirer

Cette copie ne se met pas à jour toute seule avec l'auteur (voir [Reprendre une correction de l'auteur](bien-demarrer.md#reprendre-une-correction-de-lauteur)). Dans l'application, ouvre **Plugins**, trouve la source de la carte et choisis **Upgrade** pour prendre la dernière version de cette copie, ou **Remove marketplace** pour la retirer. Depuis un terminal :

```bash
codex plugin marketplace upgrade la-carte
codex plugin add la-carte@la-carte
```

```bash
codex plugin remove la-carte@la-carte
codex plugin marketplace remove la-carte
```

Tes cartes restent dans le dossier `la-carte/` de chaque projet jusqu'à ce que tu les supprimes.

## Essayer ta copie de travail

Pointe Codex vers ton clone local plutôt que vers le dépôt Git :

```bash
codex plugin marketplace add /chemin/vers/la-carte
codex plugin add la-carte@la-carte
```

Codex copie un plugin local dans son cache quand tu l'ajoutes (contrairement à Claude Code, qui lance un plugin local directement depuis le dossier). Après avoir changé le plugin, relance `codex plugin add la-carte@la-carte` et ouvre une nouvelle session.
