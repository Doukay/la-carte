# Est-ce sûr à installer ?

Les plugins de Claude Code et de Codex peuvent lancer du code sur ton ordinateur, donc la question se pose. Certains plugins malveillants ont l'air inoffensifs à l'installation, puis téléchargent et lancent autre chose plus tard (une « seconde étape »). La carte est construit pour ne pas pouvoir faire ça, un test le vérifie à chaque changement, et tu peux tout confirmer toi-même.

Cette page dit ce qui est vrai pour **cette copie française**, y compris ce qu'elle ne garantit pas. Lis les limites à la fin avant de décider.

## Ce que la carte ne fait jamais

- **Pas de crochets (hooks).** Les crochets lancent du code automatiquement à chaque événement de chaque session, ce qui en fait une cachette classique. La carte n'en a aucun.
- **Pas de serveurs MCP.** La carte n'en a aucun, donc elle ne démarre jamais un serveur qui télécharge sa dernière version avec `npx`.
- **Pas de dépendances, pas de scripts d'installation.** Rien ne vient de npm, ni à l'installation ni plus tard. Son `package.json` n'existe que pour lancer les tests.
- **Ne télécharge jamais rien et n'exécute jamais de code venu d'Internet.** Pas de `eval`, pas de chargement de code à l'exécution, pas de contenu encodé caché.
- **Ne se connecte à aucun service extérieur.** Pas de statistiques, pas de suivi, pas de liste d'attente, pas de signalement envoyé à qui que ce soit.
- **Ne modifie jamais ton code et n'écrit nulle part ailleurs que dans son dossier `la-carte/`.** Ni `CLAUDE.md`, ni `CLAUDE.local.md`, ni `.gitignore`, ni `.git/info/exclude`, ni un fichier de réglages dans ton dossier personnel. Voir [Ce qu'il y a dans ton projet](fichiers-du-projet.md). (Les demandes « Corriger avec Claude » que tu copies et colles ensuite dans Claude demandent à Claude de modifier ton code : c'est toi qui les envoies, et Claude te demande ses autorisations comme d'habitude.)

## Tout ce qu'il fait

### Le réseau

- **Le serveur de la carte** (`la-carte/serveur.mjs`) écoute sur `127.0.0.1` seulement, donc les autres machines ne peuvent pas l'atteindre. Il ne répond qu'à `127.0.0.1` et à `localhost` sur son propre port, et son API demande un jeton que seule la page de la carte reçoit.
- **Aucune requête sortante.** Les seules requêtes de la carte vont à son propre serveur local. Un test le vérifie.
- **La page de la carte ne charge rien depuis Internet.** Son moteur de mise en page et ses polices sont intégrés au fichier. Elle contient seulement des liens vers de la documentation, qui s'ouvrent quand tu cliques.
- **Le bouton « Pas un problème »** du contrôle de santé reste sur ta machine : il écrit seulement dans `la-carte/`. Il n'envoie plus rien à l'auteur.

Poser des questions sur la carte lance Claude Code ou Codex, qui parlent à Anthropic ou à OpenAI comme ils le font toujours, avec ton compte. La carte elle-même n'envoie rien. Mais **ce que ces outils lisent part chez eux** : voir les limites plus bas.

### Les programmes qu'il lance

| Programme | Quand | Pourquoi |
|---|---|---|
| `git` | analyse | En lecture seule : quels fichiers sont suivis, la branche et le commit actuels, ce qui a changé depuis la dernière carte |
| `where` (Windows) ou `which` | démarrage du serveur de la carte | Trouver la ligne de commande de Claude Code ou de Codex |
| `claude` ou `codex` | quand tu poses une question sur la carte | Y répondre, en lecture seule : `claude -p` limité à la lecture de fichiers et au script de recherche de la carte (avec les fichiers de secrets interdits et sans les serveurs MCP de ta machine), ou `codex exec --sandbox read-only` |
| `node` | partout | Lancer les scripts de la carte |
| `cmd /c start`, `open` ou `xdg-open` | ouverture de la carte | Ouvrir l'adresse locale de la carte dans ton navigateur |

Chacun est lancé directement avec ses arguments, jamais comme une ligne de commande qu'un interpréteur de commandes (shell) réinterprète. Le seul interpréteur est `cmd /c start` de Windows, à qui on ne donne que l'adresse locale de la carte.

### Ce qui se lance sans demander

Dans Claude Code, quand la compétence est utilisée, elle autorise d'avance une seule sorte de commande : `node` qui lance un de ses propres scripts, chacun nommé exactement (`scripts/construire.mjs`, `decrire.mjs`, `ouvrir.mjs`, `plan.mjs`, `recents.mjs`, `actualiser.mjs`, `analyser.mjs` et `etat.mjs`). Cette liste est fixée par les tests plus bas. Tout le reste que fait Claude demande une autorisation selon tes réglages, comme d'habitude. Codex demande selon tes réglages d'approbation.

### Trois choses qui méritent une explication

- **`skills/la-carte/assets/vendor/elk.bundled.js`** est un fichier minifié de 1,6 Mo : le moteur de mise en page qui dispose la carte. C'est [elkjs](https://github.com/kieler/elkjs) 0.9.3, octet pour octet le même que le paquet officiel sur npm. Son SHA-256 est `b0745abd7f23cd91690a1587e377edbe19fd7233c783300290936720546216d4`. Pour le vérifier toi-même :
  ```bash
  npm pack elkjs@0.9.3
  tar -xzf elkjs-0.9.3.tgz package/lib/elk.bundled.js
  ```
  Compare ensuite `package/lib/elk.bundled.js` avec la copie de la carte, par exemple avec `sha256sum` (macOS : `shasum -a 256` ; PowerShell sous Windows : `Get-FileHash`).
- **Un seul `new Function`** dans `serveur.mjs` charge le code de recherche de la carte depuis `la-carte/requete.mjs`, un fichier que la construction de la carte a écrit dans ton projet. Il n'exécute jamais rien venu du réseau.
- **Le contrôle de santé lit le milieu des jetons qu'il trouve** (il les décode depuis le base64) pour savoir de quel genre est chaque jeton, afin d'ignorer ceux qui sont publics par conception. Il n'enregistre ni n'affiche jamais le jeton lui-même, ni même un seul de ses caractères : seulement sa longueur.

## Vérifié à chaque changement

[`tests/chaine-securite.test.mjs`](../tests/chaine-securite.test.mjs) échoue si un changement devait :

- ajouter un crochet, un serveur MCP, une dépendance ou un script d'installation ;
- envoyer une requête ailleurs que vers le serveur local de la carte ;
- lancer un programme absent du tableau ci-dessus, ou en lancer un à travers un interpréteur de commandes ;
- utiliser `eval`, charger du code à l'exécution, ou cacher une longue chaîne encodée dans le code ;
- ajouter un script qui se lancerait sans demander ;
- changer le moteur de mise en page intégré, ou ajouter un fichier venu d'ailleurs.

Pour les relancer sur ta propre copie :

```bash
node --test tests/chaine-securite.test.mjs
```

Dans cette copie, les tests se lancent avec `node --test` sur l'ordinateur de la personne qui la tient. Les tests sur GitHub ne tournent que sur demande, donc rien ne les relance tout seul à chaque enregistrement : relance-les toi-même avant de te fier à une version.

## Les limites honnêtes

- **Claude lit ton code et l'envoie à Anthropic.** La carte fonctionne parce que Claude (ou Codex, chez OpenAI) lit ton code pour le décrire. Ça part sous ton compte, selon les conditions du fournisseur, comme n'importe quelle tâche que tu lui donnes. Aucune vérification de ce plugin ne change ça. Si ton code est confidentiel, décide-le avant.
- **La bulle de questions lit le reste de tes fichiers.** Avec Claude Code, elle ne peut pas ouvrir les fichiers de secrets (`.env`, `.env.*`, `*.pem`, `*.key`, et tout nom qui contient `secret`, `token` ou `credential`), et elle ne charge pas tes serveurs MCP. Mais un secret écrit dans un fichier au nom banal, ou dans le code, peut être lu et envoyé. **Avec Codex, ce blocage n'existe pas.**
- **Le contrôle de santé donne des fausses alertes et n'est pas un audit.** Il repère des motifs, il en rate, et il se trompe. « Rien trouvé » ne veut pas dire « sûr ».
- **Le serveur local écoute sur `127.0.0.1`.** Les autres machines ne le voient pas, et les pages web d'autres sites sont refusées. Mais un programme déjà installé sur ton ordinateur peut s'y connecter comme n'importe quel programme local.
- **Les tests ne prouvent pas l'absence de défauts.** Ils vérifient une liste précise de choses (celles du haut de cette page). Ils ne remplacent pas une relecture du code.
- **C'est une copie non officielle, réécrite.** Tout le code a été réécrit en français à partir de la version 0.6.3 de l'auteur, sans être relu ligne par ligne par lui. Tu fais confiance à la personne qui tient cette copie, pas à l'auteur d'origine. Le code de l'auteur d'origine n'est plus identique octet pour octet à celui-ci, à l'exception du moteur de mise en page. Les corrections de l'auteur n'arrivent pas toutes seules (voir [Reprendre une correction de l'auteur](bien-demarrer.md#reprendre-une-correction-de-lauteur)).
- **Une mise à jour apporte ce que contient la version la plus récente de cette copie.** Avant de mettre à jour, lis le [journal des changements](../CHANGELOG.md) et relance les tests.

## Tu as trouvé quelque chose ?

Signale-le en privé, comme décrit dans la [politique de sécurité](../SECURITY.md).
