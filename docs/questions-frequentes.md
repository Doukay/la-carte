# Questions fréquentes

> Traduction française non officielle de Floorplan, de Hayden Smith. Voir le [README](../README.md).

<details>
<summary><b>Est-ce sûr à installer ?</b></summary>

Le plugin n'a ni crochets (hooks), ni serveurs MCP, ni dépendances, ne télécharge rien et n'exécute jamais de code venu d'Internet. Il ne se connecte à aucun service extérieur. Un test vérifie tout cela, et tu peux le relancer toi-même. Mais ça ne veut pas dire « sans risque » : Claude lit ton code et l'envoie à Anthropic, et le contrôle de santé n'est pas un audit. Tout est dans [Est-ce sûr à installer ?](est-ce-sur.md).
</details>

<details>
<summary><b>Mon code quitte-t-il mon ordinateur ?</b></summary>

Oui, de la façon dont Claude Code fonctionne toujours : Claude lit les fichiers dont il a besoin pour décrire ton appli, et ils partent chez Anthropic sur ton compte. La carte elle-même est un fichier local et son serveur n'écoute que sur ta machine. Si tu choisis d'ouvrir la carte dans l'application Claude, Claude envoie la carte (noms, descriptions et structure, pas ton code source) vers ton compte claude.ai privé, et il te le demande avant. La carte elle-même n'envoie rien.
</details>

<details>
<summary><b>Combien de temps ça prend, et combien ça coûte ?</b></summary>

Une première carte prend quelques minutes pour une petite appli et plus pour une grosse, parce que chaque fichier et chaque adresse du serveur est décrit. Ça consomme ton abonnement Claude comme n'importe quelle autre tâche. Les gros projets sont répartis entre plusieurs aides en parallèle. Les mises à jour ne relisent que ce qui a changé : elles sont rapides et légères.
</details>

<details>
<summary><b>Faut-il la ligne de commande pour la bulle de questions ?</b></summary>

Non, la carte marche sans. La bulle de questions répond grâce à la ligne de commande de Claude Code, qui peut lire ton vrai code. Sans la ligne de commande, tu peux poser tes questions depuis l'application Claude, à partir de la carte seule.
</details>

<details>
<summary><b>Va-t-elle modifier ou enregistrer mes fichiers ?</b></summary>

Elle n'écrit que dans son propre dossier `la-carte/`, dont seul `sources/` est à garder dans Git. Elle ne modifie jamais ton code, ton `.gitignore` ni tes fichiers `CLAUDE.md` ou `CLAUDE.local.md`. (Les demandes « Corriger avec Claude » que tu copies, elles, servent à demander à Claude de modifier ton code, et c'est toi qui les colles.)
</details>

<details>
<summary><b>Les noms choisis ne sont pas ceux qu'on utilise chez nous. Puis-je les changer ?</b></summary>

Oui. Demande simplement (« renomme "Serveur principal" en "API boutique" dans la carte »), ou modifie toi-même `la-carte/sources/architecture.json` et `la-carte/sources/descriptions/`. Tes modifications sont gardées à chaque mise à jour.
</details>

<details>
<summary><b>Puis-je l'utiliser avant d'avoir écrit du code ?</b></summary>

Oui, même si cartographier du code existant est son usage principal. Donne un cahier des charges, une spécification ou une description de ton appli et demande une carte : tu obtiens un plan, une carte de ce qu'il faudrait construire, marquée comme un plan, avec une revue des décisions encore ouvertes. Tu peux le modifier depuis la carte, puis passer à une carte du vrai code une fois qu'il est construit. Voir [Planifier une appli pas encore construite](bien-demarrer.md#planifier-une-appli-pas-encore-construite).
</details>

<details>
<summary><b>Est-ce que ça marche avec les monorepos et les projets en plusieurs dépôts ?</b></summary>

Oui. Pointe-le sur un monorepo, sur un sous-dossier, ou sur un simple dossier qui contient plusieurs dépôts côte à côte. Il trouve chaque dépôt et les relie.
</details>

<details>
<summary><b>Pourquoi une version française ?</b></summary>

Cette copie existe pour que le plugin, son code, ses messages et ses réponses soient entièrement en français, par et pour un francophone. Elle n'est pas reliée à l'original : voir [Pour commencer](bien-demarrer.md#reprendre-une-correction-de-lauteur) pour reprendre une correction de l'auteur.
</details>
