# Dépannage

### La bulle de questions dit qu'il lui faut la ligne de commande de Claude Code
La carte est ouverte sans moyen de poser des questions. Soit :
- installe la [ligne de commande de Claude Code](https://code.claude.com/docs/en/overview), connecte-toi, puis demande à Claude de mettre à jour le floorplan ou lance `node floorplan/serve.mjs` ;
- soit ouvre la carte dans l'application Claude : demande à Claude de « publier mon floorplan dans l'application Claude ». Les réponses ne viennent alors que de la carte.

### La ligne de commande est installée mais n'est pas trouvée
`serve.mjs` cherche `claude` dans ton PATH et dans `~/.local/bin`. S'il est ailleurs :

```bash
node floorplan/serve.mjs --claude /chemin/vers/claude
```

### Codex : la bulle de questions dit qu'il lui faut Codex
Le serveur de la carte cherche `codex` dans ton PATH et, sous Windows, la ligne de commande qui vient avec l'application de bureau Codex. Installe la [ligne de commande de Codex](https://developers.openai.com/codex/cli), ou indique la tienne au serveur :

```bash
node floorplan/serve.mjs --codex /chemin/vers/codex
```

Si elle dit que Codex n'est pas connecté, ouvre l'application Codex (ou lance `codex login`) et connecte-toi avec ChatGPT. Plus de détails dans [Floorplan dans Codex](codex.md).

### Codex : la carte ne s'est pas ouverte, ou la bulle de questions a cessé de marcher après l'ouverture par Codex
Codex lance ses commandes dans un bac à sable, et le serveur de la carte doit rester actif et joindre le réseau. Autorise le serveur à tourner hors du bac à sable quand Codex te le demande, ou lance toi-même `node floorplan/serve.mjs` depuis le dossier du projet.

### `node` n'est pas reconnu
Installe [Node.js](https://nodejs.org) 18 ou plus, puis ouvre une nouvelle session pour que Claude Code ou Codex le prenne en compte.

### Claude ou Codex demande sans cesse l'autorisation de lancer des scripts `node`
Dans Claude Code, Floorplan autorise d'avance ses propres scripts tant qu'il tourne, mais il peut quand même demander dans certaines configurations. Choisis l'option qui les autorise toujours pour ce projet. Codex demande selon tes réglages d'approbation ; autoriser les scripts `node` de Floorplan pour le projet arrête les demandes.

### La compétence n'apparaît pas
Les plugins se chargent au démarrage d'une session, donc ouvre-en une nouvelle après l'installation. Vérifie qu'il est installé et activé :

```bash
claude plugin list
```

Les demandes simples comme « fais-moi un floorplan » marchent sans la commande avec la barre oblique. Si tu la veux, c'est `/floorplan-fr:floorplan`.

Dans Codex, regarde **Plugins** dans l'application, ou lance `codex plugin list`, et ouvre une nouvelle discussion après l'installation. Pour l'appeler par son nom, tape `$floorplan`.

### La carte n'est plus à jour
Demande à Claude ou à Codex de « mettre à jour le floorplan ». Si un onglet était déjà ouvert, il se recharge tout seul quand la mise à jour est finie.

### La carte est vide, ou bloquée sur « Mise en page »
Les cartes faites avant la version 0.1.3 de l'auteur chargent leur moteur de mise en page depuis Internet : vérifie ta connexion ou ton bloqueur de contenu, ou demande à Claude de « mettre à jour le floorplan ». Les cartes plus récentes ont tout d'intégré et marchent hors connexion.

### La bulle de questions n'a pas d'interrupteur Modifier
**Modifier** n'apparaît que sur un [plan](getting-started.md#planifier-une-appli-pas-encore-construite), ouvert par son serveur (`node floorplan/serve.mjs`) avec la ligne de commande de Claude Code ou Codex disponible. Une carte de vrai code ne l'a pas : demande à Claude Code ou à Codex de changer le code, puis de mettre à jour le floorplan.

### Une modification d'un plan a échoué, ou elle ne me plaît pas
Si le plan mis à jour ne passe pas les contrôles de Floorplan au second essai, rien n'est enregistré et la carte reste comme avant ; essaie de demander plus précisément. Si une modification est passée mais n'est pas ce que tu voulais, appuie sur **Annuler** dans son résumé, ou demande un autre changement. Les versions précédentes sont gardées dans `floorplan/.cache/history/`.

### Un lien manque
Floorplan trouve la plupart des appels au serveur et des imports en lisant le code, mais pas tous, par exemple les appels vers une adresse qui n'existe que dans des réglages. Demande à Claude d'ajouter le lien manquant au floorplan ; il l'enregistre dans `architecture.json` et il reste à chaque mise à jour.

### Un fichier est dans la mauvaise partie, ou sous « Non affecté »
Demande à Claude de le déplacer, ou modifie les motifs `paths` dans `floorplan/architecture.json` et demande une mise à jour.

### « floorplan/ existe déjà ici et ce n'est pas une carte »
Ton projet a son propre dossier appelé `floorplan`, dans lequel Floorplan refuse d'écrire. Renomme ton dossier, ou demande à Claude de construire la carte ailleurs ; les scripts d'analyse et de construction acceptent `--out <dossier>`.

### `git status` montre des fichiers sous `floorplan/`
Ils ont été enregistrés avant que Floorplan ne se mette à ignorer le dossier. Retire-les du suivi en gardant les fichiers sur le disque :

```bash
git rm -r --cached floorplan
```

### Le port 4378 est pris
Rien à faire. Le serveur passe au port libre suivant, et l'adresse qu'il affiche, ou que Claude te donne, est la bonne.

### Arrêter le serveur d'arrière-plan

```bash
node floorplan/serve.mjs --stop
```

Il s'arrête aussi tout seul deux heures après le dernier onglet fermé.

### La bulle de questions refuse de lire un fichier
C'est voulu, avec Claude Code : les fichiers de secrets (`.env`, `.env.*`, `*.pem`, `*.key`, et tout nom qui contient `secret`, `token` ou `credential`) sont interdits à la bulle de questions. Pour qu'elle parle d'un tel fichier, dis-lui ce qu'il contient avec tes mots, sans coller de secret.

### Toujours bloqué ?
Cette copie n'a pas de page de tickets de l'auteur : il n'a rien à voir avec elle. Écris à la personne qui tient ce dépôt, en disant ce que tu avais demandé, ce qui s'est passé, si tu utilisais Claude Code ou Codex, et ce qui s'est affiché. Laisse de côté tout ce qui est privé dans ton code. Si le défaut vient visiblement du code d'origine, regarde aussi s'il est déjà connu dans les [tickets de l'auteur](https://github.com/haydenschmitty/floorplan/issues) (en lecture seulement : n'y envoie rien de privé).
