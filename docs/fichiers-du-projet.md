# Ce qu'il y a dans ton projet

La carte n'écrit qu'à un seul endroit de ton projet : le dossier `la-carte/`. Rien d'autre n'est touché : ni `CLAUDE.md`, ni ton `.gitignore`, ni rien ailleurs sur ta machine. **Aucun fichier `.md` n'est nécessaire dans ton projet** : les consignes de l'outil (`SKILL.md`) restent dans le plugin.

## Le dossier `la-carte/`

```
la-carte/
  index.html    la carte, à ouvrir
  sources/      ce qui a demandé du travail : à garder dans Git
  .cache/       tout ce qui se refabrique : à ignorer
  .gitignore    laisse passer sources/ et ignore le reste
```

### `sources/` : à enregistrer avec ton projet

`reglages.json` y a sa place s'il existe : il dit où trouver ta note de suivi (voir [Où j'en suis](utiliser-la-carte.md#où-jen-suis-facultatif)). Il ne contient que le chemin, pas la note.

| Fichier | Ce que c'est | À modifier ? |
|---|---|---|
| `architecture.json` | Les parties de ton appli, les services extérieurs, les liens en plus, les parcours et la visite guidée | **Oui** |
| `descriptions/*.json` | Le nom et la description de chaque fichier et de chaque adresse du serveur, un fichier par partie | **Oui** |
| `plan.json` | Pour les plans seulement : les fichiers, adresses du serveur et écrans prévus, qui peut utiliser chaque adresse, la technologie, les hypothèses et les questions ouvertes. Les noms et descriptions sont ici au lieu de `descriptions/` | **Oui** |
| `parcours-perso.json` | Les parcours demandés depuis la carte | Seulement pour en supprimer un |
| `questions.json` | Les questions posées depuis la carte et leurs réponses, avec l'empreinte des fichiers que chaque réponse utilise. Ce qui ressemble à une clé ou à un mot de passe y est masqué avant d'être écrit | Non : la croix de la liste oublie une question |
| `rejets-sante.json` | Les problèmes de santé que tu as marqués **Pas un problème**, avec tes raisons | Seulement pour en annuler un. **Afficher à nouveau** sur la carte le fait aussi |

Ces fichiers sont le travail qui coûte des jetons. Enregistrés dans Git, ils suivent ton projet sur un autre ordinateur ou dans un worktree, et ils ne sont pas perdus si le reste est supprimé. La carte ne les enregistre pas à ta place : ajoute `la-carte/sources/` à ton prochain enregistrement. Ils ne contiennent pas ton code, seulement des noms et des descriptions. Si ton dépôt est public, relis-les : ils décrivent comment ton appli est construite.

### Le reste : se refabrique

| Fichier | Ce que c'est |
|---|---|
| `index.html` | La carte : une seule page autonome, refaite à chaque fois |
| `.cache/graphe.json` | Tout ce que montre la carte, sous forme de données |
| `.cache/travail-recent.json` | Ce sur quoi on vient de travailler, et pourquoi |
| `.cache/serveur.mjs` | Sert la carte en local et répond aux questions par la ligne de commande de Claude Code |
| `.cache/requete.mjs` | Fait des recherches dans la carte depuis la ligne de commande ; Claude l'utilise aussi |
| `.cache/` (le reste) | L'analyse, les feuilles de travail des descriptions, l'adresse du serveur qui tourne, et, pour un plan, les 20 dernières versions auxquelles **Annuler** revient |
| `artifact.html` | Une copie à ouvrir dans l'application Claude, seulement si tu en as demandé une |
| `<projet>-carte.html` | Une copie exportée à partager, seulement si tu en as exporté une depuis Claude (le bouton Exporter de la carte la télécharge à la place) |

Tu peux supprimer `.cache/` : une mise à jour le recrée sans refaire les descriptions. **Annuler** n'aura alors plus rien où revenir.

### Modifier les noms et la structure

Tes modifications dans `sources/` sont gardées à chaque mise à jour. Tu peux :
- renommer une partie, ou reformuler une description ;
- déplacer des fichiers d'une partie à l'autre en changeant les motifs de `paths` ;
- ajouter un lien que l'analyse a manqué ;
- épingler une note sur un fichier ;
- ajouter ou changer des parcours et la visite guidée.

Ou demande simplement à Claude (« renomme "Serveur principal" en "API boutique" dans la carte »).

Un plan se modifie de la même façon, ou depuis la carte avec l'interrupteur **Modifier** de la bulle de questions. Le format du plan est dans [`plan.md`](../skills/la-carte/references/plan.md).

Le format complet est dans [`schema.md`](../skills/la-carte/references/schema.md), et le guide de style des noms et descriptions est dans [`ecrire-les-descriptions.md`](../skills/la-carte/references/ecrire-les-descriptions.md).

## Docker et mise en ligne

Le `.gitignore` de la carte ne vaut que pour Git. Si ton projet a un `Dockerfile` avec `COPY . .`, la carte partirait dans l'image : la construction te prévient, et te dit d'ajouter `la-carte/` à ton `.dockerignore`. Elle ne le fait pas à ta place, puisqu'elle n'écrit rien hors de son dossier.

Pareil si ton hébergeur publie tout le dossier du projet : exclus `la-carte/`, sinon n'importe qui pourrait voir la carte.

## Si tu veux que Claude pense à la carte

La carte n'ajoute aucune note pour Claude dans ton projet. Si tu veux que tes sessions Claude Code y pensent, écris toi-même une ligne dans ton `CLAUDE.md`, par exemple : « Il y a une carte du projet dans `la-carte/` ; avant de chercher dans le code, essaie `node la-carte/.cache/requete.mjs find <mot>`, `show`, `path` ou `overview`. »

## Si des fichiers refabriqués sont déjà dans Git

Le `.gitignore` ne les retire pas du suivi. La construction te donne la commande à lancer, qui garde les fichiers sur le disque, par exemple :

```bash
git rm -r --cached la-carte/index.html la-carte/.cache
```
