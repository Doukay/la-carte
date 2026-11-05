# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Des personnes francophones qui construisent ou font construire leur appli avec une IA, sans être développeurs, et qui veulent comprendre ce qu'elle contient. Elles ouvrent la carte sur ordinateur et sur téléphone, souvent après avoir travaillé avec Claude, pour savoir où en est leur appli et poser une question. Le premier utilisateur est le propriétaire de ce dépôt, qui mène une trentaine de projets seul.

## Product Purpose

Floorplan FR dessine une carte interactive du code d'une appli : chaque partie, fichier et appel au serveur a un nom et une description en français simple. Succès : la personne comprend comment son appli est construite sans lire le code, et trouve une réponse sans chercher.

## Positioning

La carte part du vrai code du projet et le raconte en français courant, en tutoyant, pour quelqu'un qui n'est pas développeur. Elle n'envoie rien vers l'extérieur et reste sur l'ordinateur. Traduction française non officielle de Floorplan (Hayden Smith), réécrite en français à partir de la version 0.6.3.

## Operating Context

Une page HTML autonome servie par un petit serveur local, ouverte dans un navigateur à côté de Claude Code. Sur téléphone, on doit pouvoir suivre le schéma en défilant, sans agrandir ni déplacer.

## Capabilities and Constraints

Fonctions à garder : vue d'ensemble, parties et fichiers, liens entre eux, recherche, contrôle de santé, écrans, parcours guidés, visite, travail récent, bulle de questions, export, plan d'une appli pas encore codée, thème clair et sombre. Aucune dépendance et aucune ressource chargée depuis Internet : polices et moteur de mise en page sont intégrés au fichier. Mise en page du schéma par ELK. Sur téléphone, le schéma simplifié en colonne qui défile remplace le zoom et le déplacement.

## Brand Commitments

Simplicité. On ne cherche jamais une information à plusieurs endroits. Épuré. Le résultat est raté s'il est trop chargé, trop technique, ou trop proche de l'apparence de l'auteur. Toujours afficher la mention « traduction non officielle » et le crédit à Hayden Smith.

## Evidence on Hand

La carte réelle d’une petite appli de démonstration, 72 fichiers décrits, disponible localement pour contrôler les écrans. Aucun témoignage, aucun client, aucune mesure à inventer.

## Product Principles

- Une information, un seul endroit.
- Comprendre avant de regarder : les mots simples passent avant le schéma.
- Sur téléphone, on suit du doigt : défilement et toucher, jamais de geste difficile.
- Dire ce que l'outil ne sait pas : le contrôle de santé n'est pas un audit.

## Accessibility & Inclusion

Utilisable au clavier, cibles de 44 px au toucher, contraste lisible en thème clair et sombre, mouvement réduit respecté.
