# Développer la carte (cette copie)

Cette page décrit ce dépôt tel qu'il est : une copie française et non officielle de Floorplan (de Hayden Smith, licence MIT), partie de la version 0.6.3 de l'auteur. Elle n'est reliée à aucun dépôt de l'auteur et ne publie rien vers lui. Les noms de fichiers cités ci-dessous sont ceux du code actuel ; certains seront renommés en français plus tard.

Pour proposer une correction : [CONTRIBUER.md](../CONTRIBUER.md).

## Organisation du dépôt

```
.claude-plugin/
  plugin.json          le plugin : nom, version, auteur
  marketplace.json     ce dépôt comme sa propre source d'un seul plugin
skills/la-carte/
  SKILL.md             le déroulé que suit Claude
  references/          formats et guides de style que Claude lit en travaillant
    schema.md                sources/architecture.json et .cache/travail-recent.json
    choisir-les-parties.md   comment découper un projet en une bonne carte
    ecrire-les-descriptions.md  noms et descriptions en langage simple
    plan.md             sources/plan.json, pour une carte prévue à partir d'un cahier des charges
  scripts/             Node.js, sans dépendance ; Claude les lance
    etat.mjs     y a-t-il une carte, et depuis quand n'est-elle plus à jour (se lance au chargement de la compétence)
    analyser.mjs       dépôts, fichiers, imports, adresses du serveur, appels → .cache/analyse.json
    plan.mjs       le sources/plan.json d'un plan → le même .cache/analyse.json
    construire.mjs      vérifier, affecter les fichiers, relier, santé, écrans → .cache/graphe.json + index.html
    decrire.mjs   feuilles de travail pour que Claude nomme et décrive les fichiers et adresses du serveur
    actualiser.mjs    mise à jour incrémentale : nouvelle analyse, report, signalement des changements, reconstruction
    recents.mjs     les faits pour marquer le travail récent
    ouvrir.mjs       démarrer ou réutiliser le serveur de la carte, et ouvrir le navigateur
    lib/           extraction, résolution des imports, mise en relation des routes, santé, écrans, utilitaires
  assets/
    carte/         la carte : page.html (le gabarit), css/ et js/ par sujet, assemblés à la construction
    ui/            extensions de la visionneuse : bouton de thème, plans, glossaire, santé, travail récent, écrans, visite guidée, export
    requetes-graphe.js recherches partagées dans la carte (visionneuse, requete.mjs, consignes de la bulle de questions)
    serveur.mjs      copié dans la-carte/.cache/ de chaque projet ; répond par Claude Code
    requete-cli.mjs  devient la-carte/.cache/requete.mjs
    vendor/        moteur de mise en page (elkjs) et police intégrés, avec leurs licences
tests/                 tests de non-régression et les projets d'exemple qu'ils cartographient
outils/empreintes.mjs    écrit EMPREINTES.txt, et compare une copie installée avec lui
EMPREINTES.txt          SHA-256 de chaque fichier d'où le plugin tourne
docs/                  ces guides
.github/workflows/     les tests sur GitHub, à la demande seulement
```

## Essayer ta copie de travail

Installe depuis ton dossier local :

```bash
claude plugin marketplace add /chemin/vers/la-carte
claude plugin install la-carte@la-carte
```

Un plugin installé depuis un dossier local tourne directement depuis lui, donc tes modifications s'appliquent à la session suivante, sans étape de mise à jour.

Les scripts se lancent aussi seuls, ce qui est le moyen le plus rapide d'y travailler :

```bash
node skills/la-carte/scripts/analyser.mjs /chemin/vers/un/projet
node skills/la-carte/scripts/construire.mjs /chemin/vers/un/projet
node skills/la-carte/scripts/ouvrir.mjs /chemin/vers/un/projet
```

`construire.mjs` a besoin d'un `la-carte/sources/architecture.json` dans le projet : lance la compétence une fois d'abord, ou écris-en un petit à la main ([format](../skills/la-carte/references/schema.md)). Dans le fichier, les clés `project`, `flows` et `tour` s'appellent maintenant `projet`, `parcours` et `visite`.

## Tests

```bash
node --test
```

Les tests utilisent le lanceur de tests intégré à Node : il n'y a rien à installer (`npm test` fait la même chose). **On les lance sur le PC de la personne qui tient ce dépôt, avec `node --test`, avant chaque enregistrement important.** Ceux de GitHub ne tournent qu'à la demande : Actions → Tests → Run workflow. Ils couvrent alors Linux et Windows avec Node 18, 20 et 22. Rien ne se lance tout seul à chaque envoi.

| Fichier | Ce qu'il vérifie |
|---|---|
| `lecture-code.test.mjs` | imports, adresses du serveur, appels et commentaires de documentation, par langage et par framework |
| `aides-lib.test.mjs` | motifs de fichiers, genres de fichiers, options de ligne de commande, noms de secours |
| `secrets.test.mjs` | la Santé trouve les secrets, n'en garde que la longueur, et ignore les valeurs factices |
| `fausses-alertes.test.mjs` | les fausses alertes de la Santé (empreintes de mots de passe, sauvegardes chiffrées) et la sortie « Pas un problème » |
| `sante.test.mjs` | quelles adresses du serveur la Santé juge ouvertes à tous (exemples FastAPI et Express dans `fixtures/`) |
| `public-expres.test.mjs` | ce que la Santé laisse tranquille parce que c'est public exprès (flux, adresses qu'un projet publie, réponses en cache, routes sans rien de privé, Payload CMS, jetons d'outils de suivi, fichiers qu'un outil ouvre), chacun avec un cas voisin qu'elle doit quand même signaler |
| `sante-services.test.mjs` | les contrôles de la Santé pour la sécurité des lignes de Supabase, les règles Firebase, les signatures des webhooks Stripe, les clés secrètes dans les variables publiques et le CORS, avec des cas voisins qu'ils doivent laisser, et toute une appli d'exemple mal faite puis bien faite |
| `django.test.mjs` | Django : le `urls.py` d'une appli inclus sous un préfixe, et les appels du site associés |
| `fastify.test.mjs` | Fastify : plugins enregistrés avec un préfixe, enregistrements imbriqués, et les appels du site qui atteignent le bon plugin (exemple dans `fixtures/`) |
| `cles-tables-routes.test.mjs` | tables de routes indexées par `"MÉTHODE /chemin"` en JavaScript et en Python : quelles tables comptent, le gestionnaire de chaque entrée, les appels du site qui les atteignent, et la Santé qui ne dit rien de leur connexion (exemple dans `fixtures/`) |
| `firebase.test.mjs` | Firebase Cloud Functions : fonctions appelables et `onRequest` comme adresses du serveur, les appels du site vers elles, Écrans, Santé, tâches de fond (exemple React + Firebase dans `fixtures/`) |
| `plan.test.mjs` | une carte prévue à partir d'un cahier des charges avant tout code : erreurs de sources/plan.json, adresses et appels, Écrans, revue du plan, mise à jour et passage au vrai code (cahier des charges d'exemple dans `fixtures/`) |
| `plan-modification.test.mjs` | modifier un plan depuis la carte : le plan mis à jour de Claude est vérifié, enregistré et mis en avant, retenté une fois s'il échoue aux contrôles, et annulé (ligne de commande de remplacement dans `fixtures/fake-cli/`) |
| `gros-fichiers.test.mjs` | les fichiers au-dessus de la limite de taille de l'analyse restent sur la carte avec leur nombre de lignes, et l'analyse, la Santé et la carte disent qu'ils n'ont pas été lus |
| `appli-exemple.test.mjs` | une carte complète d'une boutique en deux dépôts : adresses du serveur, appels entre dépôts, Santé, carte hors connexion, aucune valeur de secret écrite, mises à jour |
| `serveur.test.mjs` | le serveur de la carte : seulement `127.0.0.1`, seulement ses propres noms d'hôte, vérifications du jeton et de l'origine, rien servi hors de son dossier |
| `export.test.mjs` | exporter une copie à partager : ce qui est laissé de côté par défaut, les ajouts demandés, l'adresse du bouton Exporter |
| `telephone.test.mjs` | disposition téléphone et tablette : la barre du haut passe à la ligne au lieu de déborder, les boutons à icône seule gardent un nom, zones tactiles de 44 px, la feuille de détails qui s'ouvre quand on touche un bloc, les boutons de zoom sur la première ligne, la description qui se replie et la note sur l'outil d'IA affichée seulement pendant une question (contrôles sur la page construite, pas sur un vrai écran) |
| `questions.test.mjs` | poser des questions par Claude Code : lecture seule, fichiers de secrets interdits, serveurs MCP non chargés, questions de suite, progression, erreurs de connexion (lignes de commande de remplacement dans `fixtures/fake-cli/`) |
| `version.test.mjs` | la version est la même partout où elle est écrite (`plugin.json`, le journal des changements, `EMPREINTES.txt`) |
| `chaine-securite.test.mjs` | ce que le plugin peut faire reste ce que dit [Est-ce sûr à installer ?](est-ce-sur.md) : ni crochets, ni serveurs MCP, ni dépendances, aucune requête sortante, une liste fixe de programmes et de scripts autorisés d'avance, aucun code chargé à l'exécution, le moteur de mise en page intégré inchangé |
| `theme.test.mjs` | clair et sombre : la carte construite contient les deux thèmes, en choisit un avant de dessiner, et n'a qu'un bouton de thème |
| `tactile.test.mjs` | gestes tactiles : un glissement suit un doigt et finit sur un toucher annulé, pincement et déplacement à deux doigts, rien ne recadre la carte en plein geste (contrôles sur la page construite, pas sur un vrai écran) |

Les projets d'exemple sont écrits dans un dossier temporaire par `aides.mjs` (`shopApp()`) ou copiés depuis `tests/fixtures/`. Tout ce qui ressemble à un secret est assemblé à l'exécution, donc aucune fausse clé crédible n'est jamais enregistrée.

Quand tu corriges un défaut de ce que la carte détecte, ajoute un exemple qui le montre, et vérifie que le test échoue sans ta correction.

## Étendre la visionneuse

Les fichiers de `skills/la-carte/assets/ui/` sont insérés dans chaque carte, dans l'ordre de leur nom. Ils ne parlent à la visionneuse que par `window.LaCarte` (chaque fichier le reprend sous le nom `CARTE`), qui offre :
- le graphe et les recherches ;
- la navigation (`aller`, `ouvrir`, `reveler`, `montrerTableau`, `jouerParcours`) ;
- `ajouterBoutonEntete` et `ajouterSectionPanneau('overview' | 'item', fn)` ;
- `fenetre`, `message`, `stockage` ;
- des événements (`sur('ready' | 'render' | 'panel' | 'technical')`) ;
- `exporte`, défini dans une copie exportée : laisse de côté tout ce qui a besoin de Claude ou du serveur de la carte.

`20-sante.js` et `25-recent.js` sont de bons exemples.

## Règles

- **Aucune dépendance.** Les scripts doivent tourner partout où tourne Node 18+, sans rien à installer.
- **Du langage simple d'abord.** Tout ce que la carte montre doit avoir du sens pour la personne qui possède l'appli, pas seulement pour ses ingénieurs.
- **Ne jamais enregistrer ni afficher une valeur de secret, ni un seul de ses caractères.** Les constats de la Santé disent où est un secret et sa longueur, jamais la valeur.
- **Rien vers l'extérieur, rien hors de `la-carte/`.** Pas de requête sortante, pas d'écriture dans `CLAUDE.md`, `CLAUDE.local.md`, `.git/info/exclude` ni dans le dossier personnel. `chaine-securite.test.mjs` vérifie une partie de cela ; le reste, c'est à toi de le tenir.
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
- Si tu changes le numéro de version dans les deux `plugin.json`, le journal et `EMPREINTES.txt` doivent suivre, sinon `version.test.mjs` échoue.

### Marquer une version

1. Lance les tests : `node --test`. Ils doivent tous passer.
2. Régénère les empreintes : `node outils/empreintes.mjs`.
3. Ajoute la ligne du changement dans le journal.
4. Enregistre, puis marque : `git tag -a fr-N -m "résumé en une ligne"`.
5. Pour revenir à une version, voir [Revenir en arrière](bien-demarrer.md#revenir-en-arrière).

### Reprendre une correction de l'auteur

Voir [Reprendre une correction de l'auteur](bien-demarrer.md#reprendre-une-correction-de-lauteur) : on lit son journal, on refait la correction à la main avec les noms français, on repasse les tests, on marque une version.

### Contributions et sécurité

Il n'y a pas de modèle de ticket ni de demande de fusion : écris à la personne qui tient le dépôt. Les failles de sécurité passent par [SECURITY.md](../SECURITY.md), en privé.
