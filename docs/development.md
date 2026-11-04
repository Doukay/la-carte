# Développer Floorplan (cette copie)

Cette page décrit ce dépôt tel qu'il est : une copie française et non officielle de Floorplan (de Hayden Smith, licence MIT), partie de la version 0.6.3 de l'auteur. Elle n'est reliée à aucun dépôt de l'auteur et ne publie rien vers lui. Les noms de fichiers cités ci-dessous sont ceux du code actuel ; certains seront renommés en français plus tard.

## Organisation du dépôt

```
.claude-plugin/
  plugin.json          le plugin : nom, version, auteur
  marketplace.json     ce dépôt comme sa propre source d'un seul plugin
  icon.png
.codex-plugin/
  plugin.json          le même plugin pour Codex (même compétence, même version)
  icon.png
.agents/plugins/
  marketplace.json     ce dépôt comme source pour Codex
skills/floorplan/
  SKILL.md             le déroulé que suivent Claude et Codex
  agents/openai.yaml   comment Codex présente la compétence
  references/          formats et guides de style que Claude lit en travaillant
    schema.md                architecture.json et recent-work.json
    choosing-boundaries.md   comment découper un projet en une bonne carte
    writing-descriptions.md  noms et descriptions en langage simple
    blueprint.md             plan.json, pour une carte prévue à partir d'un cahier des charges
  scripts/             Node.js, sans dépendance ; Claude les lance
    status.mjs     y a-t-il une carte, et depuis quand n'est-elle plus à jour (se lance au chargement de la compétence)
    scan.mjs       dépôts, fichiers, imports, adresses du serveur, appels → .cache/scan.json
    plan.mjs       le plan.json d'un plan → le même .cache/scan.json
    build.mjs      vérifier, affecter les fichiers, relier, santé, écrans → graph.json + index.html
    describe.mjs   feuilles de travail pour que Claude nomme et décrive les fichiers et adresses du serveur
    refresh.mjs    mise à jour incrémentale : nouvelle analyse, report, signalement des changements, reconstruction
    recent.mjs     les faits pour marquer le travail récent
    open.mjs       démarrer ou réutiliser le serveur de la carte, et ouvrir le navigateur
    lib/           extraction, résolution des imports, mise en relation des routes, santé, écrans, quel agent tourne, utilitaires
  assets/
    viewer.html    la carte (le gabarit que la construction remplit)
    ui/            extensions de la visionneuse : bouton de thème, plans, glossaire, santé, travail récent, écrans, visite guidée, export
    graph-query.js recherches partagées dans la carte (visionneuse, query.mjs, consignes de la bulle de questions)
    serve.mjs      copié dans le dossier floorplan/ de chaque projet ; répond par Claude Code ou Codex
    query-cli.mjs  devient floorplan/query.mjs
    logo.png, favicon.png
    vendor/        moteur de mise en page (elkjs) et polices intégrés, avec leurs licences
tests/                 tests de non-régression et les projets d'exemple qu'ils cartographient
tools/checksums.mjs    écrit CHECKSUMS.txt, et compare une copie installée avec lui
CHECKSUMS.txt          SHA-256 de chaque fichier d'où le plugin tourne
docs/                  ces guides
.github/workflows/     les tests sur GitHub, à la demande seulement
```

## Essayer ta copie de travail

Installe depuis ton dossier local :

```bash
claude plugin marketplace add /chemin/vers/floorplan-fr
claude plugin install floorplan-fr@floorplan-fr
```

Un plugin installé depuis un dossier local tourne directement depuis lui, donc tes modifications s'appliquent à la session suivante, sans étape de mise à jour.

Pour l'essayer dans Codex, voir [Essayer ta copie de travail](codex.md#essayer-ta-copie-de-travail). Codex copie un plugin local quand tu l'ajoutes, donc relance `codex plugin add floorplan-fr@floorplan-fr` après chaque changement. `--agent claude|codex` sur build.mjs (ou `FLOORPLAN_AGENT`) et `--engine claude|codex` sur serve.mjs te laissent essayer la carte de l'un ou l'autre agent de n'importe où.

Les scripts se lancent aussi seuls, ce qui est le moyen le plus rapide d'y travailler :

```bash
node skills/floorplan/scripts/scan.mjs /chemin/vers/un/projet
node skills/floorplan/scripts/build.mjs /chemin/vers/un/projet
node skills/floorplan/scripts/open.mjs /chemin/vers/un/projet
```

`build.mjs` a besoin d'un `floorplan/architecture.json` dans le projet : lance la compétence une fois d'abord, ou écris-en un petit à la main ([format](../skills/floorplan/references/schema.md)). Dans le fichier, les clés `project`, `flows` et `tour` s'appellent maintenant `projet`, `parcours` et `visite`.

## Tests

```bash
node --test
```

Les tests utilisent le lanceur de tests intégré à Node : il n'y a rien à installer (`npm test` fait la même chose). **On les lance sur le PC de la personne qui tient ce dépôt, avec `node --test`, avant chaque enregistrement important.** Ceux de GitHub ne tournent qu'à la demande : Actions → Tests → Run workflow. Ils couvrent alors Linux et Windows avec Node 18, 20 et 22. Rien ne se lance tout seul à chaque envoi.

| Fichier | Ce qu'il vérifie |
|---|---|
| `parsing.test.mjs` | imports, adresses du serveur, appels et commentaires de documentation, par langage et par framework |
| `helpers-lib.test.mjs` | motifs de fichiers, genres de fichiers, options de ligne de commande, noms de secours |
| `secrets.test.mjs` | la Santé trouve les secrets, n'en garde que la longueur, et ignore les valeurs factices |
| `false-positives.test.mjs` | les fausses alertes de la Santé (empreintes de mots de passe, sauvegardes chiffrées) et la sortie « Pas un problème » |
| `health.test.mjs` | quelles adresses du serveur la Santé juge ouvertes à tous (exemples FastAPI et Express dans `fixtures/`) |
| `public-by-design.test.mjs` | ce que la Santé laisse tranquille parce que c'est public exprès (flux, adresses qu'un projet publie, réponses en cache, routes sans rien de privé, Payload CMS, jetons d'outils de suivi, fichiers qu'un outil ouvre), chacun avec un cas voisin qu'elle doit quand même signaler |
| `stack-health.test.mjs` | les contrôles de la Santé pour la sécurité des lignes de Supabase, les règles Firebase, les signatures des webhooks Stripe, les clés secrètes dans les variables publiques et le CORS, avec des cas voisins qu'ils doivent laisser, et toute une appli d'exemple mal faite puis bien faite |
| `django.test.mjs` | Django : le `urls.py` d'une appli inclus sous un préfixe, et les appels du site associés |
| `fastify.test.mjs` | Fastify : plugins enregistrés avec un préfixe, enregistrements imbriqués, et les appels du site qui atteignent le bon plugin (exemple dans `fixtures/`) |
| `route-table-keys.test.mjs` | tables de routes indexées par `"MÉTHODE /chemin"` en JavaScript et en Python : quelles tables comptent, le gestionnaire de chaque entrée, les appels du site qui les atteignent, et la Santé qui ne dit rien de leur connexion (exemple dans `fixtures/`) |
| `firebase.test.mjs` | Firebase Cloud Functions : fonctions appelables et `onRequest` comme adresses du serveur, les appels du site vers elles, Écrans, Santé, tâches de fond (exemple React + Firebase dans `fixtures/`) |
| `blueprint.test.mjs` | une carte prévue à partir d'un cahier des charges avant tout code : erreurs de plan.json, adresses et appels, Écrans, revue du plan, mise à jour et passage au vrai code (cahier des charges d'exemple dans `fixtures/`) |
| `blueprint-change.test.mjs` | modifier un plan depuis la carte : le plan mis à jour de l'agent est vérifié, enregistré et mis en avant, retenté une fois s'il échoue aux contrôles, et annulé (ligne de commande de remplacement dans `fixtures/fake-cli/`) |
| `large-files.test.mjs` | les fichiers au-dessus de la limite de taille de l'analyse restent sur la carte avec leur nombre de lignes, et l'analyse, la Santé et la carte disent qu'ils n'ont pas été lus |
| `sample-app.test.mjs` | une carte complète d'une boutique en deux dépôts : adresses du serveur, appels entre dépôts, Santé, carte hors connexion, aucune valeur de secret écrite, mises à jour |
| `serve.test.mjs` | le serveur de la carte : seulement `127.0.0.1`, seulement ses propres noms d'hôte, vérifications du jeton et de l'origine, rien servi hors de son dossier |
| `export.test.mjs` | exporter une copie à partager : ce qui est laissé de côté par défaut, les ajouts demandés, l'adresse du bouton Exporter |
| `phone.test.mjs` | disposition téléphone et tablette : la barre du haut passe à la ligne au lieu de déborder, les boutons à icône seule gardent un nom, zones tactiles de 44 px, la feuille de détails qui s'ouvre quand on touche un bloc, les boutons de zoom sur la première ligne, la description qui se replie et la note sur l'outil d'IA affichée seulement pendant une question (contrôles sur la page construite, pas sur un vrai écran) |
| `ask.test.mjs` | poser des questions par Claude Code ou Codex : lequel est utilisé, lecture seule, fichiers de secrets interdits, serveurs MCP non chargés, questions de suite, erreurs de connexion (lignes de commande de remplacement dans `fixtures/fake-cli/`) |
| `agents.test.mjs` | distinguer Claude Code de Codex, et ce que consigne et écrit une carte faite par chacun |
| `release.test.mjs` | la version est la même partout où elle est écrite (les deux `plugin.json`, le journal des changements, `CHECKSUMS.txt`) |
| `supply-chain.test.mjs` | ce que le plugin peut faire reste ce que dit [Est-ce sûr à installer ?](is-it-safe.md) : ni crochets, ni serveurs MCP, ni dépendances, aucune requête sortante, une liste fixe de programmes et de scripts autorisés d'avance, aucun code chargé à l'exécution, le moteur de mise en page intégré inchangé |
| `theme.test.mjs` | clair et sombre : la carte construite contient les deux thèmes, en choisit un avant de dessiner, et n'a qu'un bouton de thème |
| `touch.test.mjs` | gestes tactiles : un glissement suit un doigt et finit sur un toucher annulé, pincement et déplacement à deux doigts, rien ne recadre la carte en plein geste (contrôles sur la page construite, pas sur un vrai écran) |

Les projets d'exemple sont écrits dans un dossier temporaire par `helpers.mjs` (`shopApp()`) ou copiés depuis `tests/fixtures/`. Tout ce qui ressemble à un secret est assemblé à l'exécution, donc aucune fausse clé crédible n'est jamais enregistrée.

Quand tu corriges un défaut de ce que Floorplan détecte, ajoute un exemple qui le montre, et vérifie que le test échoue sans ta correction.

## Étendre la visionneuse

Les fichiers de `skills/floorplan/assets/ui/` sont insérés dans chaque carte, dans l'ordre de leur nom. Ils ne parlent à la visionneuse que par `window.Floorplan` (chaque fichier le reprend sous le nom `CARTE`), qui offre :
- le graphe et les recherches ;
- la navigation (`aller`, `ouvrir`, `reveler`, `montrerTableau`, `jouerParcours`) ;
- `ajouterBoutonEntete` et `ajouterSectionPanneau('overview' | 'item', fn)` ;
- `fenetre`, `message`, `stockage` ;
- des événements (`sur('ready' | 'render' | 'panel' | 'technical')`) ;
- `exporte`, défini dans une copie exportée : laisse de côté tout ce qui a besoin de Claude, de Codex ou du serveur de la carte.

`20-health.js` et `25-recent.js` sont de bons exemples.

## Ajouter un agent

Il y a deux listes, et un agent peut être sur l'une ou les deux :
- **L'agent qui a fait la carte**, dans `scripts/lib/agent.mjs` : une entrée de `DETECT` qui le reconnaît grâce aux variables qu'il définit pour chaque commande qu'il lance. La carte l'enregistre, pour que ses demandes nomment le bon agent.
- **L'agent qui répond aux questions**, dans `assets/serve.mjs` : une entrée de `ENGINES` avec son nom, où le trouver, `find` (où se trouve sa ligne de commande, plus une option `--<nom> <chemin>`) et `run` (les arguments et comment lire sa sortie en progression et en réponse).

Un moteur doit être en lecture seule d'une façon que sa ligne de commande impose, pas seulement parce que la consigne le demande ; s'il ne peut pas l'être, dis-le clairement dans les docs. Dis aussi clairement s'il ne peut pas interdire les fichiers de secrets, comme c'est le cas de Codex aujourd'hui. Mets `structured: true` seulement quand la ligne de commande tient les réponses au schéma, parce que modifier un plan depuis la carte en dépend ; sans lui, la carte ne propose pas Modifier. Ne prends jamais la commande à lancer dans la page ni dans des réglages enregistrés. Ajoute une ligne de commande de remplacement dans `tests/fixtures/fake-cli/` et des tests comme `ask.test.mjs`.

## Règles

- **Aucune dépendance.** Les scripts doivent tourner partout où tourne Node 18+, sans rien à installer.
- **Du langage simple d'abord.** Tout ce que la carte montre doit avoir du sens pour la personne qui possède l'appli, pas seulement pour ses ingénieurs.
- **Ne jamais enregistrer ni afficher une valeur de secret, ni un seul de ses caractères.** Les constats de la Santé disent où est un secret et sa longueur, jamais la valeur.
- **Rien vers l'extérieur, rien hors de `floorplan/`.** Pas de requête sortante, pas d'écriture dans `CLAUDE.md`, `CLAUDE.local.md`, `.git/info/exclude` ni dans le dossier personnel. `supply-chain.test.mjs` vérifie une partie de cela ; le reste, c'est à toi de le tenir.
- **Garde les exemples génériques.** Les commentaires du code, les docs et les demandes ne doivent décrire aucun vrai projet privé, et ne contenir ni nom de personne, ni adresse e-mail, ni chemin d'ordinateur.
- **Tout en français** : noms, commentaires, textes vus par la personne (tutoiement, langage simple). Les motifs de détection qui lisent le code d'un projet analysé restent en anglais.

## Tenir ce dépôt

### Branches et enregistrements

- `main` reste toujours utilisable. Un gros changement passe par sa propre branche, fusionnée ensuite (`git merge --no-ff`), pour qu'il se lise comme un tout dans l'historique.
- Nomme les branches d'après ce qu'elles sont : `fix/…`, `feat/…`, `docs/…`, `chore/…`.
- Un message d'enregistrement commence par un court résumé à l'impératif (« Corriger la détection de Fastify »), et le corps dit pourquoi.

### Versions et journal des changements

- Une version de cette copie est une **marque Git**, par exemple `fr-1`, `fr-2`. La marque `auteur-0.6.3` est le code de l'auteur d'origine, avant la réécriture.
- Chaque changement que les gens remarqueront ajoute une ligne dans la section `## Version française` du `CHANGELOG.md` : en langage simple, avec la version de l'auteur d'où vient une correction reprise. Le reste du fichier, ce sont les journaux de l'auteur, gardés tels quels en anglais ; **ne touche pas aux titres `## 0.6.3 (…)`**, un test les lit.
- Si tu changes le numéro de version dans les deux `plugin.json`, le journal et `CHECKSUMS.txt` doivent suivre, sinon `release.test.mjs` échoue.

### Marquer une version

1. Lance les tests : `node --test`. Ils doivent tous passer.
2. Régénère les empreintes : `node tools/checksums.mjs`.
3. Ajoute la ligne du changement dans le journal.
4. Enregistre, puis marque : `git tag -a fr-N -m "résumé en une ligne"`.
5. Pour revenir à une version, voir [Revenir en arrière](getting-started.md#revenir-en-arrière).

### Reprendre une correction de l'auteur

Voir [Reprendre une correction de l'auteur](getting-started.md#reprendre-une-correction-de-lauteur) : on lit son journal, on refait la correction à la main avec les noms français, on repasse les tests, on marque une version.

### Contributions et sécurité

Il n'y a pas de modèle de ticket ni de demande de fusion : écris à la personne qui tient le dépôt. Les failles de sécurité passent par [SECURITY.md](../SECURITY.md), en privé.
