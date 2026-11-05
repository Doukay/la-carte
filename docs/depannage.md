# Dépannage

### La bulle de questions dit qu'il lui faut la ligne de commande de Claude Code
La carte est ouverte sans moyen de poser des questions. Soit :
- installe la [ligne de commande de Claude Code](https://code.claude.com/docs/en/overview), connecte-toi, puis demande à Claude de mettre à jour la carte ou lance `node la-carte/.cache/serveur.mjs` ;
- soit ouvre la carte dans l'application Claude : demande à Claude de « publier ma carte dans l'application Claude ». Les réponses ne viennent alors que de la carte.

### La ligne de commande est installée mais n'est pas trouvée
`serveur.mjs` cherche `claude` dans ton PATH et dans `~/.local/bin`. S'il est ailleurs :

```bash
node la-carte/.cache/serveur.mjs --claude /chemin/vers/claude
```

### `node` n'est pas reconnu
Installe [Node.js](https://nodejs.org) 18 ou plus, puis ouvre une nouvelle session pour que Claude Code le prenne en compte.

### Claude demande sans cesse l'autorisation de lancer des scripts `node`
La carte autorise d'avance ses propres scripts tant qu'elle tourne, mais Claude Code peut quand même demander dans certaines configurations. Choisis l'option qui les autorise toujours pour ce projet.

### La compétence n'apparaît pas
Les plugins se chargent au démarrage d'une session, donc ouvre-en une nouvelle après l'installation. Vérifie qu'il est installé et activé :

```bash
claude plugin list
```

Les demandes simples comme « fais-moi une carte » marchent sans la commande avec la barre oblique. Si tu la veux, c'est `/la-carte:la-carte`.

### La carte n'est plus à jour
Demande à Claude de « mettre à jour la carte ». Si un onglet était déjà ouvert, il se recharge tout seul quand la mise à jour est finie.

### La carte est vide, ou bloquée sur « Mise en page »
Les cartes faites avant la version 0.1.3 de l'auteur chargent leur moteur de mise en page depuis Internet : vérifie ta connexion ou ton bloqueur de contenu, ou demande à Claude de « mettre à jour la carte ». Les cartes plus récentes ont tout d'intégré et marchent hors connexion.

### La bulle de questions n'a pas d'interrupteur Modifier
**Modifier** n'apparaît que sur un [plan](bien-demarrer.md#planifier-une-appli-pas-encore-construite), ouvert par son serveur (`node la-carte/.cache/serveur.mjs`) avec la ligne de commande de Claude Code disponible. Une carte de vrai code ne l'a pas : demande à Claude Code de changer le code, puis de mettre à jour la carte.

### Une modification d'un plan a échoué, ou elle ne me plaît pas
Si le plan mis à jour ne passe pas les contrôles de la carte au second essai, rien n'est enregistré et la carte reste comme avant ; essaie de demander plus précisément. Si une modification est passée mais n'est pas ce que tu voulais, appuie sur **Annuler** dans son résumé, ou demande un autre changement. Les versions précédentes sont gardées dans `la-carte/.cache/history/`.

### Un lien manque
La carte trouve la plupart des appels au serveur et des imports en lisant le code, mais pas tous, par exemple les appels vers une adresse qui n'existe que dans des réglages. Demande à Claude d'ajouter le lien manquant à la carte ; il l'enregistre dans `sources/architecture.json` et il reste à chaque mise à jour.

### Un fichier est dans la mauvaise partie, ou sous « Non affecté »
Demande à Claude de le déplacer, ou modifie les motifs `paths` dans `la-carte/sources/architecture.json` et demande une mise à jour.

### « la-carte/ existe déjà ici et ce n'est pas une carte »
Ton projet a son propre dossier appelé `la-carte`, dans lequel la carte refuse d'écrire. Renomme ton dossier, ou demande à Claude de construire la carte ailleurs ; les scripts d'analyse et de construction acceptent `--out <dossier>`.

### `git status` montre des fichiers sous `la-carte/`
Ils ont été enregistrés avant que la carte ne se mette à ignorer le dossier. Retire-les du suivi en gardant les fichiers sur le disque :

```bash
git rm -r --cached la-carte
```

### Le port 4378 est pris
Rien à faire. Le serveur passe au port libre suivant, et l'adresse qu'il affiche, ou que Claude te donne, est la bonne.

### Arrêter le serveur d'arrière-plan

```bash
node la-carte/.cache/serveur.mjs --stop
```

Il s'arrête aussi tout seul deux heures après le dernier onglet fermé.

### La bulle de questions refuse de lire un fichier
C'est voulu, avec Claude Code : les fichiers de secrets (`.env`, `.env.*`, `*.pem`, `*.key`, et tout nom qui contient `secret`, `token` ou `credential`) sont interdits à la bulle de questions. Pour qu'elle parle d'un tel fichier, dis-lui ce qu'il contient avec tes mots, sans coller de secret.

### Toujours bloqué ?
Cette copie n'a pas de page de tickets de l'auteur : il n'a rien à voir avec elle. Écris à la personne qui tient ce dépôt, en disant ce que tu avais demandé, ce qui s'est passé, ce qui s'est affiché. Laisse de côté tout ce qui est privé dans ton code. Si le défaut vient visiblement du code d'origine, regarde aussi s'il est déjà connu dans les [tickets de l'auteur](https://github.com/haydenschmitty/floorplan/issues) (en lecture seulement : n'y envoie rien de privé).
