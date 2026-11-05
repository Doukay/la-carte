# Pour commencer

> Traduction française non officielle de Floorplan (de Hayden Smith, licence MIT). Voir le [README](../README.md).

La carte marche dans **Claude Code** et dans **Codex**. Faire une carte et s'en servir est pareil dans les deux ; seule l'installation change. Ce guide montre Claude Code, et [la carte dans Codex](codex.md) donne les étapes pour Codex.

## Ce qu'il te faut

- **Claude Code** (l'onglet Code de l'application de bureau Claude, ou la ligne de commande Claude Code dans un terminal), ou **Codex** (l'application ou la ligne de commande, connecté avec ChatGPT).
- **[Node.js](https://nodejs.org) 18 ou plus.** Les scripts de la carte tournent dessus. Vérifie avec `node --version`.
- **Avec Claude Code, conseillé : la [ligne de commande de Claude Code](https://code.claude.com/docs/en/overview)**, même si tu utilises surtout l'application de bureau. Grâce à elle, la bulle de questions de la carte peut lire ton vrai code pour répondre. Codex n'a besoin de rien de plus : son application contient ce qu'utilise la bulle de questions.

## Installation

Cette copie n'est pas dans une boutique de plugins. Tu l'installes depuis son dossier sur ta machine, ou depuis son dépôt Git (si ton Git y a accès : le dépôt peut être privé). Le plugin et la source s'appellent tous deux `la-carte`.

**Dans Claude Code**, lance ces commandes une fois, dans n'importe quel terminal :

```bash
claude plugin marketplace add /chemin/vers/la-carte
claude plugin install la-carte@la-carte
```

La première commande ajoute le dossier de cette copie comme source de plugins (pour le dépôt Git : `claude plugin marketplace add <compte>/la-carte`). La seconde installe la carte pour tous tes projets. L'application de bureau et la ligne de commande partagent les mêmes réglages : il apparaît donc dans les deux.

**Dans Codex**, ouvre **Plugins → Add a marketplace**, entre le chemin du dossier (ou l'adresse du dépôt) de cette copie, et installe la carte. Détails dans [la carte dans Codex](codex.md#installation).

**Ouvre une nouvelle session** ensuite. Les plugins se chargent au démarrage d'une session.

> Dans l'application de bureau Claude, tu peux aussi parcourir les plugins avec le bouton **+** à côté de la zone de saisie (**Add plugins**, ou **Plugins → Browse plugins**). Elle liste les plugins des sources que tu as déjà ajoutées.

## Fais ta première carte

1. **Ouvre ton projet.** Dans l'onglet Code de l'application de bureau Claude, choisis le dossier de ton projet dans la ligne sous la zone de saisie avant d'envoyer ton premier message. Dans l'application Codex, ouvre le dossier du projet. Dans un terminal, lance `claude` ou `codex` depuis le dossier du projet.

   Si ton appli est répartie dans plusieurs dépôts (disons `web/` et `api/` côte à côte), ouvre le dossier qui les contient tous. La carte les cartographie ensemble et relie les appels de l'un à l'autre.

2. **Demande-la :**

   > Fais-moi une carte de cette appli.

   Dans Claude Code tu peux aussi choisir **la-carte** dans le menu **/**, ou taper `/la-carte:la-carte`. Dans Codex, tape `$la-carte`.

3. **Laisse-le travailler.** Voici ce qui se passe :
   - Une analyse liste chaque fichier, import, adresse du serveur et appel au serveur. Elle prend quelques secondes et ne coûte aucun jeton.
   - Claude ou Codex lit tes README, tes fichiers de réglages et tes points d'entrée, puis décide des grandes parties de ton appli et de leur rôle.
   - Il écrit un nom en langage simple et une description d'une ligne pour chaque fichier et chaque adresse du serveur. Dans Claude Code, les projets de plus de 150 fichiers environ sont répartis entre plusieurs aides en parallèle.
   - La carte est construite et contrôlée : liens, problèmes de santé et écrans.

   Une petite appli prend quelques minutes, une grosse plus longtemps. On peut te demander l'autorisation de lancer les scripts de la carte (`node …`) : accepte. Codex demande aussi à lancer le serveur de la carte hors de son bac à sable, pour que la carte reste active et que la bulle de questions puisse joindre Codex.

4. **Regarde autour de toi.** La carte s'ouvre toute seule, dans le navigateur de l'application ou dans ton navigateur web. Une visite guidée **Commencer ici** d'une minute se lance la première fois. La réponse résume comment ton appli tient ensemble et signale ce que le contrôle de santé a trouvé de sérieux.

Voir [Utiliser la carte](utiliser-la-carte.md) pour tout ce que tu peux faire dessus.

## Garde-la à jour

Après que toi, ou ton IA, avez travaillé sur le code :

> Mets à jour la carte.

La carte refait l'analyse et la compare à la dernière carte. Les fichiers déplacés gardent leurs descriptions, ceux qui sont supprimés disparaissent, et seul ce qui est nouveau ou dont le rôle a changé est réécrit. Une carte déjà ouverte dans ton navigateur se recharge toute seule, et les blocs qui viennent de changer s'allument en vert dans **Travail récent**.

## Planifier une appli pas encore construite

Tout ce qui précède concerne le travail principal de la carte : cartographier du code qui existe déjà. Il a un second usage, quand il n'y a pas encore de code : dessiner un **plan** d'appli à partir d'un cahier des charges, d'une spécification ou d'une description de ce que tu veux construire. Ouvre le dossier où tu la construiras (un dossier vide convient), donne le document, et demande :

> Voici mon cahier des charges. Fais-moi une carte de ce qu'il faudrait construire.

Tu obtiens un **plan** : la même carte, avec chaque partie, fichier, adresse du serveur et écran dont l'appli aurait besoin, comment ils se relient, et les services extérieurs dont ils dépendent. Ses blocs ont un contour en pointillés pour que tu voies que c'est un plan. La réponse nomme la technologie choisie par Claude ou Codex, ce qu'il a supposé, et les questions que ton cahier des charges laisse ouvertes.

Sur la carte :
- **Revue du plan** liste ce que le plan doit encore décider, comme les adresses du serveur que tout le monde pourrait utiliser ou les questions ouvertes. **Résoudre sur la carte** en règle une : pour une question, tu tapes simplement ta réponse.
- Passe la bulle de questions sur **Modifier** pour remodeler le plan (« prévois aussi les remboursements »). La carte se redessine en montrant ce qui a changé, et **Annuler** remet l'ancien plan.
- Chaque partie a **Construire ça avec Claude** (ou Codex), une demande toute prête pour construire cette seule partie.

Quand le code existe, demande à Claude ou à Codex de « cartographier le vrai code maintenant », et le plan devient une carte normale. Voir [Les plans](comment-ca-marche.md#les-plans) pour le fonctionnement.

## Ouvrir la carte toi-même

La carte est un dossier dans ton projet. Soit :

```bash
node la-carte/.cache/serveur.mjs
```

la sert à l'adresse http://127.0.0.1:4378 avec une bulle de questions qui marche, soit tu double-cliques sur `la-carte/index.html`, où tout marche sauf poser des questions.

Quand la carte est ouverte pour toi, le serveur tourne en arrière-plan et s'arrête tout seul deux heures après que tu as fermé le dernier onglet. Pour l'arrêter plus tôt :

```bash
node la-carte/.cache/serveur.mjs --stop
```

## Mettre le plugin à jour

Pour Codex, voir [Mettre à jour ou retirer](codex.md#mettre-à-jour-ou-retirer).

Cette copie **ne se met pas à jour toute seule avec l'auteur** : elle n'est reliée à aucune de ses versions. Ce que tu mets à jour ici, ce sont seulement les changements faits dans cette copie. Si tu l'as installée depuis son dépôt Git, dans Claude Code :

```bash
claude plugin update la-carte@la-carte
```

Ou active les mises à jour automatiques : dans une session Claude Code, lance `/plugin`, ouvre **Marketplaces** et choisis **Enable auto-update**. Dans les deux cas, la mise à jour s'applique à ta session suivante. Si tu l'as installée depuis un dossier local, il n'y a rien à mettre à jour : le plugin tourne directement depuis le dossier. Le [journal des changements](../CHANGELOG.md) dit ce qui a changé dans cette copie (section « Version française »).

## Reprendre une correction de l'auteur

L'auteur continue de publier des versions de son côté. Rien n'en arrive ici automatiquement, parce que tout le code de cette copie a été réécrit en français (les noms de fonctions, de fichiers et les textes ne ressemblent plus à l'original). Pour profiter d'une correction qui t'intéresse :

1. **Lis le journal de l'auteur.** Le fichier `CHANGELOG.md` de son dépôt (en anglais) dit ce que contient chaque version. Pour voir les changements précis entre deux versions, regarde les commits de son dépôt entre elles, sur GitHub ou dans un clone à part, qui n'est pas relié à cette copie :
   ```bash
   git clone https://github.com/haydenschmitty/floorplan floorplan-auteur
   cd floorplan-auteur
   git log --oneline floorplan--v0.6.3..floorplan--v0.6.4
   git diff floorplan--v0.6.3 floorplan--v0.6.4 -- skills/
   ```
   (les versions de l'auteur sont marquées `floorplan--vX.Y.Z` ; remplace par les numéros qui t'intéressent). Cette copie est partie de la 0.6.3.
2. **Refais la correction à la main** dans cette copie, avec les noms français. Un correctif copié tel quel ne s'applique pas : il faut le recopier avec les bons noms. Pour une correction de détection (une nouvelle adresse du serveur reconnue, par exemple), ajoute aussi un exemple dans les tests, comme l'auteur le fait.
3. **Repasse les tests** : `node --test` depuis le dossier de cette copie.
4. **Marque une version.** Quand tout passe, enregistre et marque l'état avec une marque Git, par exemple :
   ```bash
   git tag -a fr-2 -m "Correction de l'auteur reprise : <ce que c'est>"
   ```
   Note dans le [journal des changements](../CHANGELOG.md#version-française) ce que tu as repris et de quelle version de l'auteur.

## Revenir en arrière

Chaque version marquée de cette copie est une marque Git. `auteur-0.6.3` est le code de l'auteur d'origine, avant toute réécriture. Pour voir celles qui existent et revenir à l'une d'elles, depuis le dossier de cette copie :

```bash
git tag --list
git checkout fr-1
```

(`fr-1` est un exemple : remplace-le par une marque de la liste.)

Si le plugin est installé depuis ce dossier, ouvre une nouvelle session pour que ce soit pris en compte (avec Codex, relance `codex plugin add la-carte@la-carte`). Pour revenir à la dernière version : `git checkout main`. Si tu l'as installé depuis le dépôt Git, indique la marque comme référence quand tu ajoutes la source (c'est le champ **Git ref** dans l'application Codex ; pour Claude Code, regarde `claude plugin marketplace add --help`).

Les cartes déjà faites restent dans le dossier `la-carte/` de chaque projet : revenir en arrière ne les efface pas. Demande une mise à jour de la carte pour les refaire avec la version retrouvée.

## Le retirer

```bash
claude plugin uninstall la-carte@la-carte
claude plugin marketplace remove la-carte
```

Dans Codex, voir [Mettre à jour ou retirer](codex.md#mettre-à-jour-ou-retirer). Supprime ensuite le dossier `la-carte/` de chaque projet où tu l'as utilisé.
