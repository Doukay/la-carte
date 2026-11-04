# Politique de sécurité

Cette copie française de Floorplan n'est pas officielle et n'a aucun lien avec l'auteur d'origine, Hayden Smith.

## Signaler une faille

Signale-la en privé à la personne qui tient ce dépôt, sans l'écrire dans un ticket public. Si le dépôt est sur GitHub, utilise l'onglet **Security** puis **Report a vulnerability** quand il est disponible ; sinon, contacte directement la personne qui te l'a donné.

Dis ce qu'est le problème et ce qu'on pourrait en faire, comment le reproduire, et la version concernée (`.claude-plugin/plugin.json`, et la marque Git si tu en as une).

Si le défaut vient visiblement du code d'origine (il existe aussi dans la version de l'auteur), signale-le aussi à l'auteur, sur son dépôt : <https://github.com/haydenschmitty/floorplan>.

## Ce que le plugin peut faire

[Est-ce sûr à installer ?](docs/is-it-safe.md) liste tout ce que Floorplan fait sur ton ordinateur, les programmes qu'il lance, ce qu'il ne fait jamais, et ses limites. [`tests/supply-chain.test.mjs`](tests/supply-chain.test.mjs) le vérifie (`node --test`).

## Dans le périmètre

- le serveur local de la carte (`serve.mjs`) ;
- tout ce qui pourrait faire fuir des secrets ou du code source ;
- tout ce qui écrirait en dehors du dossier `floorplan/` du projet ou enverrait quelque chose sur Internet.

Hors périmètre : les défauts de Claude Code lui-même, à signaler à [Anthropic](https://www.anthropic.com/responsible-disclosure-policy), et ceux de Codex lui-même, à signaler à [OpenAI](https://help.openai.com/en/articles/6653653-how-to-report-security-vulnerabilities-to-openai).

## Versions concernées

Seule la dernière version marquée de cette copie reçoit des corrections.
