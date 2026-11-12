# Politique de sécurité

Cette copie française de Floorplan n'est pas officielle et n'a aucun lien avec l'auteur d'origine, Hayden Smith.

## Signaler une faille

Signale-la en privé à la personne qui tient ce dépôt, sans l'écrire dans un ticket public : sur GitHub, onglet **Security**, puis **Report a vulnerability**.

Dis ce qu'est le problème et ce qu'on pourrait en faire, comment le reproduire, et la version concernée (`.claude-plugin/plugin.json`, et la marque Git si tu en as une).

Si le défaut vient visiblement du code d'origine (il existe aussi dans la version de l'auteur), signale-le aussi à l'auteur, sur son dépôt : <https://github.com/haydenschmitty/floorplan>.

## Ce que le plugin peut faire

[Est-ce sûr à installer ?](docs/est-ce-sur.md) liste tout ce que la carte fait sur ton ordinateur, les programmes qu'elle lance, ce qu'elle ne fait jamais, et ses limites. [`tests/chaine-securite.test.mjs`](tests/chaine-securite.test.mjs) le vérifie (`node --test`).

## Dans le périmètre

- le serveur local de la carte (`serveur.mjs`) ;
- tout ce qui pourrait faire fuir des secrets ou du code source ;
- tout ce qui écrirait en dehors du dossier `la-carte/` du projet ou enverrait quelque chose sur Internet.

Hors périmètre : les défauts de Claude Code lui-même, à signaler à [Anthropic](https://www.anthropic.com/responsible-disclosure-policy).

## Versions concernées

Seule la dernière version marquée de cette copie reçoit des corrections.
