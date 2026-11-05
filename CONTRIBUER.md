# Proposer une correction

Tu as testé La carte sur ton projet et quelque chose ne va pas, ou pourrait aller mieux ? Tu peux proposer une correction. Ce dépôt n'accepte que du code de l'outil : rien de ton projet ne doit y entrer.

## Comment ça se passe

1. Tu copies le dépôt sur ton compte GitHub (**Fork**) et tu y fais ta correction.
2. Tu lances les contrôles sur ton ordinateur (voir plus bas).
3. Tu proposes ta correction (**Pull request**).
4. Les contrôles automatiques se relancent.
5. La personne qui tient ce dépôt relit, demande des changements, accepte ou refuse.

Personne d'autre ne peut modifier ce dépôt. Rien n'est intégré sans relecture, même si tous les contrôles sont verts. Il n'y a pas de délai promis.

## Ce qui ne doit jamais être envoyé

Une proposition est publique dès qu'elle est envoyée. La retirer ou la refuser ne l'efface pas : elle reste visible dans l'historique et elle a pu être copiée.

- mots de passe, clés, jetons, fichiers `.env` ;
- données personnelles : noms, adresses, e-mails, clients, utilisateurs, chiffres d'une activité ;
- le code de ton projet, même un extrait, et son nom s'il est privé ;
- ton dossier `la-carte/` : `index.html`, `sources/`, `.cache/` et les copies exportées décrivent ton projet ;
- captures d'écran ou journaux de ton projet ;
- chemins de ton ordinateur, adresses de ton réseau ou de ton serveur, noms de tes outils personnels.

**Si un secret est parti quand même :** change-le tout de suite, là où il sert. C'est la seule protection qui marche. Puis préviens la personne qui tient ce dépôt, en privé, comme pour une faille ([SECURITY.md](SECURITY.md)).

**Ton adresse e-mail** figure aussi dans chaque commit. Pour la cacher, active **Keep my email addresses private** dans les réglages de ton compte GitHub (**Emails**), puis signe tes commits avec l'adresse `noreply` que GitHub y donne.

## Montrer un problème sans montrer ton projet

Décris-le avec des mesures, pas avec ton code :

> Environ 1 200 fichiers, une vue de 90 blocs : page bloquée 14 s, blocs illisibles.

Quand il faut un exemple, invente-le : un petit projet fictif dans `tests/fixtures/`, avec des noms inventés, qui reproduit le même cas.

## Une correction doit servir à tous

Chaque projet est plus ou moins gros, plus ou moins dense. Une correction doit marcher pour tous :

- rien d'écrit en dur pour un projet, un dossier, un serveur ou un outil précis ;
- essaie-la sur un petit projet **et** sur un gros, et donne les chiffres avant et après ;
- ce qui ne sert qu'à certains devient une option, invisible sans son réglage ;
- ce qui ne sert qu'à toi reste chez toi. L'export d'une page et les réglages sont faits pour ça.

## Les règles de l'outil

- **Aucune dépendance**, rien à installer : Node.js suffit.
- **Aucun envoi vers Internet** : l'outil ne contacte aucun service, et ne suit personne.
- **Le code de la personne n'est jamais modifié.** La carte n'écrit que dans `la-carte/`.
- **Claude reste en lecture seule** depuis la carte : ce qu'il renvoie est contrôlé avant d'être écrit.
- **Les textes visibles sont en français**, en langage simple, en tutoyant la personne.
- **Une alerte fausse coûte plus cher qu'une alerte ratée :** dans le doute, l'outil se tait. Dis comment tu as vérifié sur de vrais cas.
- **Toute correction arrive avec son test.**

## Les contrôles à lancer

Depuis le dossier du dépôt :

```bash
node outils/rien-de-personnel.mjs .
```

```bash
node outils/empreintes.mjs
```

```bash
node --test
```

Le premier cherche ce qui ne doit pas entrer dans le dépôt : chemins, adresses privées, outils personnels. Il ne connaît pas tes secrets ni ton nom : relis quand même ce que tu envoies. Le deuxième met à jour la liste des fichiers embarqués, à enregistrer avec ta correction.

Un contrôle qui refuse peut avoir raison : `tests/chaine-securite.test.mjs` échoue si tu ajoutes une dépendance, un envoi vers Internet ou un programme lancé. Change-le seulement si c'est voulu, et dis pourquoi.

## Si tu utilises une IA

C'est permis. Tu restes responsable de ce que tu proposes : relis, teste, et n'envoie pas à l'IA ce que tu n'enverrais pas ici. Pas de mention de l'outil dans les commits, le README le dit déjà.

## Licence

En proposant une correction, tu acceptes qu'elle soit publiée sous la licence [MIT](LICENSE) de ce dépôt. N'y mets que du code que tu as le droit de partager.

## Une faille de sécurité

Ne l'écris pas dans une proposition publique : suis [SECURITY.md](SECURITY.md).
