---
name: La carte
description: La carte d'une appli, expliquée en français simple, dans le calme d'une fiche produit.
colors:
  accent: "#0066cc"
  on-hover: "#0071e3"
  ring: "#0071e3"
  n-ui: "#0066cc"
  n-service: "#8944ab"
  n-external: "#248a3d"
  n-test: "#b25000"
  n-misc: "#66666b"
  teinte-ui: "color-mix(in srgb, #0066cc 10%, #ffffff)"
  teinte-service: "color-mix(in srgb, #8944ab 10%, #ffffff)"
  teinte-external: "color-mix(in srgb, #248a3d 10%, #ffffff)"
  teinte-test: "color-mix(in srgb, #b25000 10%, #ffffff)"
  bg: "#f5f5f7"
  surface: "#ffffff"
  raise: "#f0f0f2"
  raise-2: "#e6e6ea"
  hair: "#f0f0f0"
  hair-2: "#e0e0e0"
  text: "#1d1d1f"
  text-2: "#333336"
  text-3: "#66666b"
  barre: "#000000"
  barre-champ: "#1d1d1f"
  barre-survol: "#272729"
  barre-texte: "#f5f5f7"
  barre-texte-2: "#a1a1a6"
  ok: "#248a3d"
  ok-bg: "#e9f6ec"
  ok-text: "#1a6b2f"
  sev-high: "#d70015"
  sev-medium: "#b25000"
  sev-low: "#6e6e73"
  warn-bg: "#fff4e5"
  warn-text: "#7a4100"
  k-import: "#6e6e73"
  k-http: "#0066cc"
  k-call: "#8944ab"
  k-rpc: "#3634a3"
  k-event: "#d30f45"
  k-queue: "#b25000"
  k-data: "#0071a4"
  k-config: "#4f5661"
  k-contains: "#8d8d8d"
  accent-sombre: "#2997ff"
  on-hover-sombre: "#64b0ff"
  on-text-sombre: "#000000"
  n-service-sombre: "#bf5af2"
  n-external-sombre: "#30d158"
  n-test-sombre: "#ff9f0a"
  n-misc-sombre: "#98989d"
  teinte-ui-sombre: "color-mix(in srgb, #2997ff 10%, #1d1d1f)"
  teinte-service-sombre: "color-mix(in srgb, #bf5af2 10%, #1d1d1f)"
  teinte-external-sombre: "color-mix(in srgb, #30d158 10%, #1d1d1f)"
  teinte-test-sombre: "color-mix(in srgb, #ff9f0a 10%, #1d1d1f)"
  bg-sombre: "#111113"
  surface-sombre: "#1d1d1f"
  raise-sombre: "#272729"
  raise-2-sombre: "#333336"
  text-sombre: "#f5f5f7"
  text-2-sombre: "#d2d2d7"
  text-3-sombre: "#a1a1a6"
  text-4-sombre: "#86868b"
  sev-high-sombre: "#ff6961"
  sev-medium-sombre: "#ffb340"
  warn-text-sombre: "#ffd8a0"
  ok-text-sombre: "#a8e9bd"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-.035em"
  display-telephone:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.02em"
  body-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-.01em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "-.01em"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Code, SF Mono, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  ico: "8px"
  menu-ligne: "12px"
  tuile: "14px"
  bloc: "18px"
  bulle: "28px"
  pilule: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  bloc-y: "18px"
  bloc-x: "20px"
  gouttiere: "28px"
  gouttiere-telephone: "20px"
components:
  button-soft:
    backgroundColor: "rgba(0, 0, 0, .06)"
    textColor: "{colors.text}"
    rounded: "{rounded.pilule}"
    padding: "0 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pilule}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.on-hover}"
  barre-haut:
    backgroundColor: "{colors.barre}"
    textColor: "{colors.barre-texte}"
    height: "52px"
  barre-recherche:
    backgroundColor: "{colors.barre-champ}"
    textColor: "{colors.barre-texte-2}"
    rounded: "{rounded.pilule}"
    height: "34px"
  bloc-appli:
    backgroundColor: "{colors.teinte-ui}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.bloc}"
    padding: "18px 20px"
  bloc-coulisses:
    backgroundColor: "{colors.teinte-service}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.bloc}"
    padding: "18px 20px"
  bloc-exterieur:
    backgroundColor: "{colors.teinte-external}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.bloc}"
    padding: "18px 20px"
  bloc-outils:
    backgroundColor: "{colors.teinte-test}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.bloc}"
    padding: "18px 20px"
  panneau:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.bloc}"
    width: "360px"
  bulle-questions:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.bulle}"
    padding: "8px 8px 8px 18px"
  tuile-chiffre:
    backgroundColor: "rgba(0, 0, 0, .04)"
    rounded: "{rounded.tuile}"
    padding: "10px 12px"
  lien-utilise:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pilule}"
    padding: "0 14px"
    height: "44px"
---

# Design System: La carte

Ce fichier décrit l'apparence de la carte telle qu'elle est construite aujourd'hui (`skills/la-carte/assets/carte.html` et `assets/ui/`). Les titres des huit grandes parties restent en anglais parce que les outils les reconnaissent à ce nom. Le bloc de valeurs en tête de fichier fait foi. Les noms de valeurs viennent du code : `n-ui` est le groupe appli, `k-http` le lien vers le serveur, `-sombre` la version du thème sombre.

## Overview

**Creative North Star: "La fiche produit calme"**

La carte se lit comme une fiche produit Apple : un fond perle, une barre noire, de grands titres serrés, très peu d'éléments et beaucoup d'air. Le propriétaire a choisi ce style sur la vraie carte, le 05/11/2026. La disposition du schéma reste celle de l'outil d'origine. Seule son apparence change.

La couleur ne décore pas, elle classe. Chaque groupe de blocs a sa teinte et les blocs reliés se lisent d'un coup d'œil. Le bleu dit ce qu'on peut faire. Tout le reste est du gris ou du blanc.

Le refus est net : pas de fond noir à néons comme les cartes de code habituelles, et pas une apparence trop proche de celle de l'auteur. La page est pensée pour une personne qui n'est pas développeuse : elle doit rester simple, et chaque information n'apparaît qu'à un seul endroit.

**Key Characteristics:**
- Une barre noire en haut, un fond perle, des blocs teintés et posés à plat.
- Quatre couleurs de groupe, un bleu pour agir, aucun logo dans la page.
- Des icônes en trait fin, choisies selon chaque projet.
- Un thème clair et un thème sombre équivalents, le clair par défaut.
- Sur téléphone, une colonne qui défile à la place du schéma.

## Colors

Une base neutre très calme, quatre couleurs de groupe posées à 10 % et un seul bleu pour agir.

### Primary

- **Bleu d'action** (`accent`, #0066cc ; sombre #2997ff) : boutons pleins, bouton d'envoi de la bulle, points et pastilles actives. Son survol et l'anneau de focus utilisent la nuance voisine (`on-hover`, `ring`).

### Secondary

Les quatre couleurs de groupe, demandées par le propriétaire. Chacune teinte le fond du bloc à 10 % et son carré d'icône à 18 %.

- **Bleu appli** (`n-ui`, #0066cc ; sombre #2997ff) : ce que la personne ouvre et utilise.
- **Violet coulisses** (`n-service`, #8944ab ; sombre #bf5af2) : serveur, traitements, données, réglages.
- **Vert services extérieurs** (`n-external`, #248a3d ; sombre #30d158) : ce qui vient d'ailleurs. Ces blocs gardent en plus un filet de leur couleur.
- **Orange outils** (`n-test`, #b25000 ; sombre #ff9f0a) : tests, scripts, déploiement.
- **Gris sans groupe** (`n-misc`, #66666b ; sombre #98989d) : un élément rattaché à aucun groupe.

### Tertiary

Les couleurs d'état et de lien. Elles informent et ne décorent jamais.

- **État** : vert `ok` pour ce qui va bien, rouge `sev-high` pour un problème sérieux, orange `sev-medium` pour un point à regarder, gris `sev-low` pour un point mineur. Les encadrés utilisent `ok-bg` + `ok-text` et `warn-bg` + `warn-text`.
- **Liens du schéma** : gris `k-import` pour le lien ordinaire, bleu `k-http` pour un appel au serveur. Les types plus rares gardent chacun leur couleur (`k-call`, `k-rpc`, `k-event`, `k-queue`, `k-data`). `k-config` est en tirets et `k-contains` en pointillés. Le contrat de direction disait « liens gris, appels au serveur en bleu » : le code va plus loin, et c'est le code qui est décrit ici.

### Neutral

- **Perle** (`bg`, #f5f5f7 ; sombre #111113) : le fond de la page.
- **Blanc de carte** (`surface`, #ffffff ; sombre #1d1d1f) : le panneau, la bulle, les menus et les fenêtres.
- **Gris doux** (`raise`, `raise-2`) : les pastilles et les zones en léger relief.
- **Encre** (`text`, #1d1d1f ; sombre #f5f5f7) : les titres et le texte principal.
- **Gris de lecture** (`text-2`, `text-3`) : les descriptions, puis les indications et les petits libellés.
- **Noir de barre** (`barre`, #000000) : la barre du haut, identique dans les deux thèmes, avec son champ de recherche (`barre-champ`), son survol (`barre-survol`) et ses textes (`barre-texte`, `barre-texte-2`).

### Named Rules

**La règle du groupe.** Un bloc porte la couleur de son groupe, et un bloc intérieur prend celle de sa partie de premier niveau. On ne crée pas de couleur pour un type de bloc ni pour faire joli.

**La règle du bleu qui agit.** Un bouton plein est toujours bleu. Le bleu qui remplit une surface veut dire « appuie ici ». Le bleu de groupe, lui, reste une teinte à 10 %.

**La règle de la barre noire.** La barre du haut est la seule grande surface en noir pur. Les fonds du thème sombre restent légèrement au-dessus (`bg-sombre`).

## Typography

**Police principale :** la police système Apple (SF), avec Inter en secours, intégrée au fichier.
**Police des chemins :** JetBrains Mono, intégrée au fichier elle aussi.

**Character :** une seule famille, droite et nette, qui tient le rôle des titres comme du texte. Aucune police n'est chargée depuis Internet. Hors des appareils Apple, c'est Inter qui s'affiche.

### Hierarchy

- **Display** (`display`, 600, 34px, serré à -.035em) : le nom du sujet ouvert, en haut à gauche. Il descend à 20px sur téléphone (`display-telephone`).
- **Headline** (`headline`, 600, 20px) : le titre d'un élément dans le panneau.
- **Title** (`title`, 600, 16px) : le nom d'un bloc sur le schéma.
- **Body large** (`body-large`, 400, 14px) : la description du sujet ouvert, sur 520px au plus, et les réponses de la bulle.
- **Body** (`body`, 400, 13.5px) : le texte courant, les descriptions du panneau et des blocs.
- **Label** (`label`, 500, 12.5px) : les titres de section du panneau, en gris, sans capitales.
- **Caption** (`caption`, 400, 11.5px) : les tailles de fichiers, les pastilles, le crédit. Les chiffres s'alignent en colonnes (`tabular-nums`).
- **Mono** (`mono`, 400, 11.5px) : les chemins de fichiers et les raccourcis clavier.

### Named Rules

**La règle du titre serré.** Plus un titre est grand, plus ses lettres sont serrées : -.035em pour le grand titre, -.02em pour les titres de blocs et du panneau. Le texte courant reste à -.01em.

**La règle du mono rare.** La police à chasse fixe sert aux chemins, aux adresses et aux touches, jamais à une phrase ou à un titre destiné à la lecture.

## Layout

La page entière est le schéma. Tout le reste flotte par-dessus.

**Ordinateur (1000px et plus).** Barre noire de 52px en trois zones : le niveau courant à gauche, la recherche au centre, les actions à droite (Thème, Santé, Commencer ici, Exporter, Parcours, filtres, détails). En haut à gauche, le grand titre et la description. À droite, le panneau de 360px, redimensionnable, décollé des bords de 16px. Il commence par les chiffres. En bas au centre, la bulle de questions. En bas à gauche, les boutons de zoom.

**Tablette (701 à 999px).** La barre passe sur deux rangées et ses boutons ne gardent que leurs icônes, en 44px. Le panneau démarre fermé. Les boutons de zoom remontent en haut à droite pour ne pas passer sous la bulle. Les écrans tactiles jusqu'à 1279px reprennent cette barre.

**Téléphone (700px et moins).** Une colonne qui défile remplace le schéma, sans zoom ni déplacement. L'appli vient d'abord, les outils et les blocs sans lien à la fin. Sous chaque bloc, « Utilise » liste ce qu'il utilise. Un trait n'apparaît qu'entre deux rangées reliées. Le panneau devient une feuille qui monte du bas, et la bulle s'efface tant que la feuille est ouverte. La description se replie sur une ligne avec un bouton Plus. Exporter, les filtres et le choix du thème disparaissent de la barre.

**Rythme.** Les blocs sont séparés par une gouttière de 28px (20px sur téléphone). L'intérieur d'un bloc est de 18px sur 20px, et les sections du panneau reprennent cet écart.

### Named Rules

**La règle de l'endroit unique.** Une information n'a qu'une place. Le titre et la description du sujet ouvert sont en haut à gauche et ne sont jamais répétés dans le panneau. Le crédit à Hayden Smith et la mention « traduction non officielle » restent visibles, à une seule place.

**La règle du doigt.** Au toucher, chaque commande fait au moins 44px, et le téléphone se parcourt en défilant. Aucun geste difficile n'est demandé.

## Elevation & Depth

La carte est à plat. La profondeur vient du contraste entre le fond perle, les teintes et le blanc du panneau. Les éléments flottants sont détachés par un filet d'un pixel, sans flou. Une vraie ombre n'apparaît qu'autour de la bulle de questions, quand on y écrit, parce qu'elle signale que la bulle est active. S'y ajoutent deux détails minuscules : le bouton actif de l'interrupteur Demander / Modifier (`0 1px 2px`) et le point lumineux qui suit un parcours. Le fond derrière une fenêtre ouverte s'assombrit et se floute de 4px.

### Shadow Vocabulary

- **Filet flottant** (`box-shadow: 0 0 0 1px #e8e8ed`, sombre `#333336`) : panneau, bulle, menus, boutons de zoom.
- **Filet de survol** (`box-shadow: 0 0 0 1px #d2d2d7`, sombre `#48484a`) : un bloc survolé.
- **Anneau de sélection** (`box-shadow: 0 0 0 2px`, couleur `ring`) : le bloc sélectionné.
- **Ombre de la bulle** (`box-shadow: 0 20px 48px -22px rgba(0, 0, 0, .3)`, sombre `0 24px 64px -24px rgba(0, 0, 0, .8)`) : la bulle de questions pendant la saisie.

### Named Rules

**La règle du bloc posé.** Un bloc n'a jamais d'ombre floue et ne se soulève pas au survol. Il change de filet et sa teinte se renforce un peu, c'est tout.

## Shapes

Des formes douces et régulières, sans angle vif. Les conteneurs sont arrondis à 18px : blocs, panneau, menus, fenêtres. Les tuiles et les lignes du panneau le sont à 14px, les lignes de menu à 12px, les carrés d'icône à 8px. Tout ce qui s'appuie du doigt ou qui se lit comme une étiquette est une pilule entièrement arrondie. La bulle de questions a son propre arrondi de 28px.

Les icônes sont dessinées en trait, à bouts ronds : trait de 1.75 dans la barre, trait de 2 dans les blocs. Elles sont choisies selon le projet parmi la liste `ICONES` de `scripts/lib/commun.mjs`, et chaque type de bloc a une icône par défaut.

## Components

### Buttons

Discrets au repos, ils répondent nettement quand on appuie.

- **Forme :** pilule de 36px de haut, 44px au toucher.
- **Ordinaire :** sans fond, texte gris. Un voile gris apparaît au survol.
- **Doux :** voile gris permanent, pour les actions du panneau comme Ouvrir et Retour.
- **Principal :** plein de bleu, pour l'action qui valide. Un seul à la fois.
- **Appui :** le bouton rétrécit à .95, en .2s avec la courbe `--ease`.

### Chips

- **Pastille d'information :** pilule grise pour une taille de fichier ou le nom de l'outil d'IA relié, avec un petit point coloré si elle indique un état.
- **Lien « Utilise » (téléphone) :** pilule blanche de 44px, qui mène au bloc cité. Les liens en trop se regroupent dans une pilule « +4 ».
- **Référence dans une réponse :** pilule grise avec un point à la couleur du groupe.

### Cards / Containers

- **Bloc :** arrondi de 18px, fond à la teinte de son groupe, sans ombre. Il contient le carré d'icône de 30px, le nom, la description.
- **Bloc de service extérieur :** même fond, avec un filet intérieur de sa couleur.
- **Sélection :** anneau bleu de 2px autour du bloc.
- **Tuile de chiffre :** voile gris, arrondi de 14px, chiffre en 17px gras et libellé dessous.

### Inputs / Fields

- **Recherche :** champ gris foncé dans la barre noire, avec son icône et la touche `/`. Sur téléphone, il se réduit à un bouton rond de 44px.
- **Zone de texte :** sans bordure, sur un voile gris. Au focus, le voile se renforce et un filet apparaît.

### Navigation

La barre noire porte tout. Le niveau courant se lit à gauche, les niveaux supérieurs sont en gris, et la flèche permet de remonter. Sur téléphone, les boutons empilent icône et mot (Santé, Commencer ici, Parcours, Détails).

### Panneau de détails

La surface blanche de 360px où se lit le détail. Sa liste de parties se range sous quatre intitulés (Applications utilisées, Dans les coulisses, Services extérieurs, Outils de développement), chaque ligne portant un point à la couleur de son groupe, son nom, une description sur deux lignes au plus et sa taille à droite.

### Bulle de questions

La grande pilule blanche en bas. Elle contient le champ en 15px, l'état de l'outil d'IA et le bouton d'envoi rond et bleu. Sur téléphone, elle prend toute la largeur moins 8px de chaque côté.

### Colonne du téléphone

La version téléphone du schéma : des blocs entièrement teintés en pleine largeur, un chevron à droite pour ceux qu'on peut ouvrir, et un trait vertical de 2px entre deux rangées reliées.

### Mouvement

Une seule courbe douce (`--ease`, cubic-bezier(.16, 1, .3, 1)), des durées de .15s à .55s. Les blocs entrent en léger fondu. Le changement de thème est instantané, jamais animé.

## Do's and Don'ts

### Do:

- **À faire :** teinter un nouveau bloc à 10 % de la couleur de son groupe, et son carré d'icône à 18 %.
- **À faire :** réserver le bleu plein aux commandes et le bleu de lien aux appels au serveur.
- **À faire :** ajouter chaque nouvelle couleur en version claire et en version sombre, sous le même nom de variable.
- **À faire :** choisir l'icône d'un bloc dans la liste `ICONES`, selon ce que fait le projet.
- **À faire :** détacher un élément flottant par un filet d'un pixel plutôt que par une ombre.
- **À faire :** chercher si une information est déjà affichée avant de l'ajouter quelque part.
- **À faire :** garder 44px pour toute commande utilisée au toucher.

### Don't:

- **À éviter :** un fond noir avec des néons, comme les cartes de code habituelles.
- **À éviter :** un logo dans la page : le nom du projet en grand titre suffit.
- **À éviter :** une ombre floue ou un soulèvement sur un bloc.
- **À éviter :** une cinquième couleur de groupe, ou une couleur par type de bloc.
- **À éviter :** répéter dans le panneau le titre et la description du sujet ouvert.
- **À éviter :** le zoom ou le déplacement sur téléphone.
- **À éviter :** une police, une image ou un script chargés depuis Internet.
