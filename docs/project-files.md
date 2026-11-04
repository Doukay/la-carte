# Ce qu'il y a dans ton projet

Floorplan n'écrit qu'à un seul endroit de ton projet : le dossier `floorplan/`. Il n'est pas enregistré dans Git, et rien d'autre dans ton projet n'est touché. En particulier, cette version n'écrit jamais dans `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.gitignore`, `.git/info/exclude`, ni ailleurs sur ta machine.

## Le dossier `floorplan/`

| Fichier | Ce que c'est | À modifier ? |
|---|---|---|
| `index.html` | La carte : une seule page autonome | Non. Refaite à chaque fois |
| `graph.json` | Tout ce que montre la carte, sous forme de données | Non. Refait à chaque fois |
| `architecture.json` | Les parties de ton appli, les services extérieurs, les liens en plus, les parcours et la visite guidée | **Oui** |
| `descriptions/*.json` | Le nom et la description de chaque fichier et de chaque adresse du serveur, un fichier par partie | **Oui** |
| `plan.json` | Pour les plans seulement : les fichiers, adresses du serveur et écrans prévus, qui peut utiliser chaque adresse, la technologie, les hypothèses et les questions ouvertes. Les noms et descriptions sont ici au lieu de `descriptions/` | **Oui** |
| `recent-work.json` | Ce sur quoi on vient de travailler, et pourquoi. Remplacé à chaque mise à jour | Rarement. C'est l'IA qui l'écrit |
| `custom-flows.json` | Les parcours demandés depuis la carte | Seulement pour en supprimer un |
| `health-dismissed.json` | Les problèmes de santé que tu as marqués **Pas un problème**, avec tes raisons | Seulement pour en annuler un. **Afficher à nouveau** sur la carte le fait aussi |
| `serve.mjs` | Sert la carte en local et répond aux questions par la ligne de commande de Claude Code ou par Codex | Non |
| `query.mjs` | Fait des recherches dans la carte depuis la ligne de commande ; Claude et Codex l'utilisent aussi | Non |
| `artifact.html` | Une copie à ouvrir dans l'application Claude, seulement si tu en as demandé une | Non |
| `<projet>-map.html` | Une copie exportée à partager, seulement si tu en as exporté une depuis Claude ou Codex (le bouton Exporter de la carte la télécharge à la place) | Non |
| `.cache/` | L'analyse, les feuilles de travail des descriptions, les changements de la dernière mise à jour, l'adresse du serveur qui tourne, et, pour un plan, les 20 dernières versions du plan auxquelles **Annuler** revient | Non. Tu peux le supprimer, mais **Annuler** n'aura alors plus rien où revenir |
| `.gitignore` | Garde tout ce dossier hors de Git | Non |

### Modifier les noms et la structure

Tes modifications de `architecture.json` et de `descriptions/` sont gardées à chaque mise à jour. Tu peux :
- renommer une partie, ou reformuler une description ;
- déplacer des fichiers d'une partie à l'autre en changeant les motifs de `paths` ;
- ajouter un lien que l'analyse a manqué ;
- épingler une note sur un fichier ;
- ajouter ou changer des parcours et la visite guidée.

Ou demande simplement à Claude ou à Codex (« renomme "Serveur principal" en "API boutique" dans le floorplan »).

Un plan se modifie de la même façon, par `plan.json` et `architecture.json`, ou depuis la carte avec l'interrupteur **Modifier** de la bulle de questions. Le format du plan est dans [`blueprint.md`](../skills/floorplan/references/blueprint.md).

Le format complet est dans [`skills/floorplan/references/schema.md`](../skills/floorplan/references/schema.md), et le guide de style des noms et descriptions est dans [`writing-descriptions.md`](../skills/floorplan/references/writing-descriptions.md).

## Pas de fichier de notes pour Claude

Les versions d'origine de Floorplan pouvaient, si tu acceptais, ajouter une section à `CLAUDE.local.md` et le faire ignorer par Git (`.git/info/exclude`). **Cette version ne le fait pas** : elle n'écrit que dans `floorplan/`. Si tu veux que tes sessions Claude Code pensent à la carte, écris toi-même une ligne dans ton `CLAUDE.md` ou dans ton `CLAUDE.local.md`, par exemple : « Il y a une carte du projet dans `floorplan/` ; avant de chercher dans le code, essaie `node floorplan/query.mjs find <mot>`, `show`, `path` ou `overview`. »

Si ton projet a un `CLAUDE.local.md` ou des lignes dans `.git/info/exclude` venant d'une version d'origine de Floorplan, ils restent tels quels jusqu'à ce que tu les retires toi-même (la section est entre `<!-- floorplan:start -->` et `<!-- floorplan:end -->`).

## Rester hors de Git

**`floorplan/`** contient son propre `.gitignore` qui ignore tout ce qu'il y a dans le dossier, lui-même compris. Ton `.gitignore` n'est pas modifié, et le dossier n'apparaît jamais dans `git status`.

La carte est personnelle à chaque copie du projet. Les collègues qui installent Floorplan font la leur.

Si tu avais déjà enregistré un dossier `floorplan/` dans Git, l'ignorer ne le retire pas du suivi. La construction te donne la commande qui le fait, en gardant les fichiers sur le disque :

```bash
git rm -r --cached floorplan
```
