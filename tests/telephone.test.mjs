// Affichage sur téléphone : la carte construite a une barre du haut qui passe à la ligne au lieu de déborder, des boutons à icône seule qui gardent
// un nom, des zones tactiles de 44 px et une feuille de détails qui s’ouvre quand on touche un bloc. Ce sont des contrôles sur la page construite
// (les règles et le code sont là, et la ligne de démarrage est lancée dans un faux navigateur), pas sur un vrai écran.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { appliBoutique, analyserEtConstruire, nettoyer } from './aides.mjs';

let racine, page;
before(() => { racine = appliBoutique(); analyserEtConstruire(racine); page = fs.readFileSync(path.join(racine, 'la-carte', 'index.html'), 'utf8'); });
after(() => nettoyer(racine));

/** Le CSS de chaque bloc @media de la page ayant exactement cette condition, mis bout à bout (une page peut en avoir plusieurs avec la même condition). */
function blocMedia(condition) {
  let sortie = '', depuis = 0, trouves = 0;
  for (;;) {
    const debut = page.indexOf(`@media ${condition} {`, depuis);
    if (debut < 0) break;
    let profondeur = 0, i = page.indexOf('{', debut);
    const ouverture = i + 1;
    for (; i < page.length; i++) { if (page[i] === '{') profondeur++; else if (page[i] === '}' && --profondeur === 0) break; }
    sortie += page.slice(ouverture, i) + '\n'; trouves++; depuis = i;
  }
  assert.ok(trouves > 0, `la page a un bloc de règles pour ${condition}`);
  return sortie;
}

test('sur téléphone et tablette, la barre du haut passe sur une deuxième ligne, pour que rien ne déborde de l’écran', () => {
  const regles = blocMedia('(max-width: 999px), (max-width: 1279px) and (pointer: coarse)');
  assert.match(regles, /header \{[^}]*display: flex; flex-wrap: wrap;/);
  assert.match(regles, /\.hr \{[^}]*flex-wrap: wrap;/);
  assert.match(regles, /\.hr \.btn \.bl \{ display: none; \}/);
});

test('avec une souris à 1000 px et plus, la barre du haut reste exactement comme avant : chaque changement de la barre est dans une règle téléphone/tablette', () => {
  assert.match(page, /header \{ position: fixed; inset: 0 0 auto 0; height: 52px; display: grid; grid-template-columns: minmax\(max-content, 1fr\) minmax\(0, auto\) minmax\(max-content, 1fr\);/);
  const dehors = page.replace(/@media [^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  assert.doesNotMatch(dehors, /header \{[^}]*flex-wrap/);
  assert.doesNotMatch(dehors, /\.hr \.btn \.bl \{ display: none/);
  assert.doesNotMatch(dehors, /#btn-up, \.brand \{ flex: none; \}/); // la flèche Haut et le logo ne changent pas sur un ordinateur
  assert.doesNotMatch(dehors, /header \.btn:focus-visible/);
});

test('chaque bouton de la barre a un nom qui reste quand ses mots sont cachés', () => {
  const entete = page.match(/<header>[\s\S]*?<\/header>/)[0];
  const boutons = [...entete.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(boutons.length >= 5);
  for (const b of boutons) assert.match(b, /aria-label="[^"]+"/, `${b} a un aria-label`);
  // les boutons ajoutés par les parties en plus prennent leur texte comme nom, et Santé dit combien de choses demandent un coup d’œil
  assert.match(page, /if \(libelle\) b\.setAttribute\('aria-label', libelle\)/);
  assert.match(page, /bouton\.setAttribute\('aria-label', bouton\.title\)/);
});

test('les zones tactiles font au moins 44 px sur petit écran et écran tactile, boutons de zoom compris', () => {
  const regles = blocMedia('(max-width: 999px), (pointer: coarse)');
  assert.match(regles, /header \.btn, #search-btn \{ height: 44px; min-width: 44px; \}/);
  assert.match(regles, /header \.btn\.icon \{ width: 44px; \}/);
  assert.match(regles, /#zoom button \{ width: 44px; height: 44px; \}/);
  assert.match(regles, /#ask-mode button \{ height: 44px; \}/); // le sélecteur Demander / Modifier aussi
});

test('sur un téléphone, poser une question ou préparer une modification ferme d’abord la feuille de détails, et le résumé après une modification aussi, pour que rien ne cache la bulle de questions ni le résumé', () => {
  assert.match(page, /demander: \(texte\) => \{ fermerFeuille\(\); champQuestion\.value = texte; envoyerQuestion\(\); \}/);
  assert.match(page, /preparerChangement\(texte\) \{\s*if \(!changementPossible\(\)\) return false;\s*fermerFeuille\(\);/);
  assert.match(page, /function montrerResultatChangement\(\) \{[\s\S]*?fermerFeuille\(\);[\s\S]*?afficherFeuille\(c\.question,/);
});

test('sur un téléphone, le panneau de détails est une feuille en bas qui démarre fermée et ne couvre pas la bulle de questions', () => {
  const regles = blocMedia('(max-width: 700px)');
  assert.match(regles, /#panel \{ top: auto; left: 8px; right: 8px; bottom: 8px; width: auto; max-height: min\(56vh, 480px\); \}/);
  assert.match(regles, /body:not\(\.no-panel\) #ask \{ display: none; \}/);
  assert.match(regles, /#panel-resize \{ display: none; \}/);
});

test('toucher un bloc sur un téléphone ouvre les détails ; entrer dans un bloc, en sortir ou toucher un espace vide les ferme', () => {
  assert.match(page, /if \(sel && estTelephone\(\) && document\.body\.classList\.contains\('no-panel'\)\) \{ reglerPanneau\(true\); if \(typeof sel === 'string'\) \{ amenerDansVue\(sel\); montrerDansColonne\(sel\); \} \}/);
  assert.match(page, /svg\.addEventListener\('click', fermerFeuille\);/);
  assert.match(page, /fermerFeuille\(\);\n  allerVers\(element, \{ zoomFrom: element \}\);/);
  assert.match(page, /function monterNiveau\(\) \{ if \(etatVue\.container === 'root'\) return; fermerFeuille\(\);/);
  // le choix sur un téléphone ou une tablette n’est pas enregistré, donc il ne peut pas fermer le panneau latéral d’un ordinateur qui partage le même stockage
  assert.match(page, /if \(!petitEcran\(\)\) stockageLocal\.set\('panel', on\);/);
});

test('sur tablette, le panneau démarre fermé pour laisser la place à la carte et s’ouvre quand on touche un bloc', () => {
  assert.match(page, /const petitEcran = \(\) => matchMedia\('\(max-width: 999px\)'\)\.matches;/);
  assert.match(page, /classList\.toggle\('no-panel', petitEcran\(\) \|\| !stockageLocal\.get\('panel', true\)\);/);
  assert.match(page, /else if \(sel && petitEcran\(\) && document\.body\.classList\.contains\('no-panel'\)\) reglerPanneau\(true\);/);
});

test('sur téléphone, les liens en trop restent vraiment cachés tant qu’on n’a pas touché « +N »', () => {
  assert.match(blocMedia('(max-width: 700px)'), /\.col-lien\[hidden\] \{ display: none; \}/); // display: inline-flex écraserait sinon l'attribut hidden
});

test('la hauteur de la barre du haut est mesurée, et tout ce qui est dessous la suit', () => {
  assert.match(page, /new ResizeObserver\(synchroniserEntete\)\.observe\(elEntete\)/);
  for (const selecteur of ['#context', '#flowbar', '#panel', '#panel-resize']) assert.match(page, new RegExp(`${selecteur} \\{[^}]*calc\\(var\\(--hh, 64px\\) \\+ \\d+px\\)`), `${selecteur} suit la barre`);
});

test('les animations sont coupées pour les personnes qui demandent moins de mouvement', () => {
  const regles = blocMedia('(prefers-reduced-motion: reduce) and (max-width: 999px), (prefers-reduced-motion: reduce) and (pointer: coarse)');
  assert.match(regles, /#panel, body\.no-panel #panel, #viewport\.anim, #ask, #flowbar, #zoom button \{ transition: none; \}/);
});

/** Lance le script de démarrage d’une ligne (avant que rien ne soit dessiné) dans un faux navigateur. */
function demarrage({ phone, hash = '' }) {
  const classes = new Set();
  const scriptDemarrage = page.match(/<body>\s*<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(scriptDemarrage, {
    matchMedia: (q) => ({ matches: phone && q.includes('max-width: 999px') }),
    location: { hash },
    document: { body: { classList: { add: (c) => classes.add(c) } } },
  });
  return classes;
}

test('un téléphone démarre avec les détails fermés (pour qu’ils ne s’ouvrent jamais l’espace d’un instant), sauf si le lien pointe vers un bloc', () => {
  assert.ok(demarrage({ phone: true }).has('no-panel'));
  assert.ok(!demarrage({ phone: true, hash: '#v=a&s=n:web' }).has('no-panel'));
  assert.ok(!demarrage({ phone: false }).has('no-panel'));
});

test('ouvrir la feuille de détails sur un téléphone ne recadre pas la carte', () => {
  assert.match(page, /if \(etait !== on && !estTelephone\(\)\) ajusterVue\(true\);/);
});

test('Parcours et Filtres s’ouvrent à l’intérieur de l’écran partout où la barre passe à la ligne', () => {
  assert.match(blocMedia('(max-width: 999px), (max-width: 1279px) and (pointer: coarse)'), /header \.rel \{ position: static; \}[^\n]*\n  #flowmenu, #legend \{ position: fixed;/);
});

test('les boutons de zoom sortent de sous la bulle de questions sur tablette et téléphone', () => {
  assert.match(page, /@media \(max-width: 999px\), \(max-width: 1279px\) and \(pointer: coarse\) \{\n  header \.hr \.btn \{ width: 44px; \}[\s\S]*?#zoom \{ left: auto; right: calc\(var\(--pw\) \+ 16px\); bottom: auto; top: calc\(var\(--hh, 56px\) \+ 8px\);/);
});

test('la feuille du téléphone s’atteint et se ferme au clavier : Échap la ferme, fermée elle est cachée de la tabulation et des lecteurs d’écran, le focus y entre puis revient', () => {
  assert.match(blocMedia('(max-width: 700px)'), /body\.no-panel #panel \{[^}]*visibility: hidden;/);
  assert.match(page, /else if \(estTelephone\(\) && !document\.body\.classList\.contains\('no-panel'\)\) fermerFeuille\(\);/);
  assert.match(page, /panneau\.setAttribute\('role', 'dialog'\); panneau\.setAttribute\('aria-label', 'Détails'\)/);
  assert.match(page, /if \(on && utilisateurClavier\) \{ retourFeuille = document\.activeElement; panneau\.focus/);
  assert.match(page, /retourFeuille\.focus\?\./);
});

test('sur un téléphone, la description se replie sur une ligne, avec un bouton Plus / Moins qui dit si elle est ouverte et dont le choix est retenu', () => {
  const regles = blocMedia('(max-width: 700px)');
  assert.match(regles, /#context\.folded \.cd \{ display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; \}/);
  assert.match(regles, /#context \.ctx-more:not\(\[hidden\]\) \{ display: inline-flex; align-items: center; min-height: 44px;/);
  assert.match(page, /\.ctx-more \{ display: none; \}/); // seuls les téléphones le montrent
  assert.match(page, /<button type="button" class="ctx-more" aria-controls="ctx-desc" hidden><\/button>/);
  assert.match(page, /boutonPlus\.setAttribute\('aria-expanded', String\(deplie\)\);/);
  assert.match(page, /stockageLocal\.set\('contextOpen', !deplie\)/);
  assert.match(page, /desc\.inert = estTelephone\(\) && long && !deplie;/); // on ne peut pas atteindre les lignes cachées avec la tabulation
});

test('sur un téléphone, l’avertissement sur la connexion d’un outil d’IA ne s’affiche que pendant que la bulle de questions sert, et il est lu à voix haute quand il apparaît', () => {
  assert.match(blocMedia('(max-width: 700px)'), /#ask:not\(\.asking\) #ask-warn \{ display: none; \}/);
  assert.match(page, /<div id="ask-live" role="status" aria-live="polite"><\/div>/);
  assert.match(page, /\['pointerdown', 'touchstart', 'focusin'\]\.forEach\(\(t\) => boiteQuestion\.addEventListener\(t, \(\) => questionActive\(true\)/); // un toucher compte même quand le champ est désactivé
  assert.match(page, /boiteQuestion\.addEventListener\('focusout', \(ev\) => \{ if \(!boiteQuestion\.contains\(ev\.relatedTarget\)\) questionActive\(false\); \}\);/);
  assert.match(page, /const on = estTelephone\(\) && champQuestion\.disabled && !alerte\.hidden; if \(on\) \{ formQuestion\.tabIndex = 0;/); // au clavier, on peut atteindre la note quand le champ est désactivé
});

test('sur un téléphone, la colonne qui défile remplace le schéma : ni zoom ni déplacement', () => {
  const regles = blocMedia('(max-width: 700px)');
  assert.match(regles, /#svg, #zoom \{ display: none; \}/);
  assert.match(regles, /#colonne \{ display: block; position: absolute; inset: var\(--hh, 56px\) 0 0 0; overflow-y: auto;[^}]*touch-action: pan-y;/);
  assert.match(page, /\n#colonne \{ display: none; \}/); // au-dessus d'un téléphone, le schéma reste
  assert.match(page, /rendreColonne\(vue, res\);/);
  assert.match(page, /if \(id\.startsWith\('x:'\) \|\| ouvrable\(id\)\) ouvrirBloc\(id\); else choisir\(id\);/); // toucher un bloc l'ouvre ou montre ses détails
  assert.match(page, /role="button" tabindex="0"/); // atteignable au clavier
  assert.match(page, /if \(modeColonne\(\)\) colonne\.prepend\(elContexte\); else contexteOrigine\.insertBefore\(elContexte, contexteSuivant\);/);
  assert.match(page, /#crumbs button:not\(\.cur\):not\(:nth-last-child\(3\)\), #crumbs button\.cur:not\(:first-child\) \{ display: none; \}/); // le chemin montre où tu es, donc la rangée tient à 360 px
});

test('sur téléphone, les liens en trop restent vraiment cachés tant qu’on n’a pas touché « +N »', () => {
  assert.match(blocMedia('(max-width: 700px)'), /\.col-lien\[hidden\] \{ display: none; \}/); // display: inline-flex écraserait sinon l'attribut hidden
});

test('estTelephone est défini avant la détection de l’outil d’IA, qui s’en sert dès le chargement', () => {
  assert.ok(page.indexOf('const estTelephone = ') < page.indexOf('if (!COPIE_EXPORTEE) detecterMoteur();'));
});

test('rien de nouveau n’apparaît sur un ordinateur : les boutons n’ont pas ajouté d’infobulles', () => {
  assert.doesNotMatch(page, /id="search-btn" title=/);
  assert.doesNotMatch(page, /id="flows-btn" title=/);
});

test('au-delà de 14 blocs sur ordinateur, la vue passe en cartes : pas de calcul de schéma, pas de lignes', () => {
  assert.match(page, /const SEUIL_CARTES = 14;/);
  assert.match(page, /body\.vue-cartes\.in-flow \.col-bloc \{ scroll-margin-top: 156px; \}/); // la barre du parcours ne cache pas la carte concernée
  assert.match(page, /if \(COPIE_EXPORTEE\) return ''; \/\/ celui qui reçoit une copie/);
  assert.match(page, /const ZOOM_LISIBLE = 0\.45;/);
  assert.match(page, /< ZOOM_LISIBLE\) \{ reglerCartes\(true\); res = disposerColonne\(vue\); \}/);
  assert.match(page, /\n\s*'elk\.separateConnectedComponents': 'true'/); // sur sa propre ligne : un commentaire en fin de ligne l'avait désactivé
  assert.match(page, /cibles\.sort\(\(x, y\) => coupes\.has\(y\) - coupes\.has\(x\)\);/); // un lien coupé ne se cache pas derrière « +N »
  assert.match(page, /const enCartes = !estTelephone\(\) && !reponse && \(resteEnCartes \|\| vue\.visible\.length \+ vue\.connectors\.length > SEUIL_CARTES\);/);
  // décocher un type de lien ne rebascule pas un bloc en schéma sans lignes : il reste en cartes tant qu'on ne le quitte pas
  assert.match(page, /const resteEnCartes = etatVue\.cartesDe === vue\.container;/);
  assert.match(page, /etatVue\.cartesDe = vueEnCartes && !estTelephone\(\) \? vue\.container : null;/);
  assert.match(page, /if \(modeColonne\(\)\) return disposerColonne\(vue\);/); // aucun schéma à calculer : c'est ce qui bloquait la page
  assert.match(page, /body\.vue-cartes #svg, body\.vue-cartes #zoom, body\.vue-cartes #colonne > \.credit \{ display: none; \}/);
  assert.match(page, /body\.vue-cartes \.col-lien\[hidden\] \{ display: none; \}/); // display: inline-flex écraserait hidden
  assert.match(page, /body\.vue-cartes \.col-lien\.coupe \{ color: var\(--k-casse\); text-decoration: line-through; \}/);
});
