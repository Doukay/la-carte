// ======================= blocs =======================
// Les blocs ne montrent que ce qu'on lit d'un coup d'œil : pictogramme, nom, description, un seul compte. Les chemins, types et
// tailles sont dans l'infobulle au survol et dans le panneau de détails.
// [largeur, hauteur minimale]
const TAILLES = { node: [300, 140], dir: [272, 120], file: [284, 120], module: [284, 120], route: [300, 140], symbol: [260, 108] };
const HAUTEUR_NOTE = 64;
const HAUTEUR_PIED = 30;   // la ligne du pied : taille à gauche, pastille de travail récent à droite
const HAUTEUR_TITRE2 = 10; // un titre qui passe sur une deuxième ligne
const MARGE = 28; // place autour de chaque bloc pour son ombre, son anneau de sélection et son soulèvement au survol (correspond à --gutter)
/** Éléments du pied : la taille du bloc (modules / fichiers / adresses du serveur) et sa pastille de travail récent. Vide si aucun ne s'applique. */
function piedBloc(element) {
  const i = infosBloc(element);
  let taille = '';
  if (i.type === 'node' && i.n.kind !== 'external') { const sous = (fils.get(element) || []).filter((k) => k.startsWith('n:')).length; taille = sous ? accorder(sous, 'partie') : accorder(statsDe(element).files, 'fichier'); }
  else if (i.type === 'dir') taille = accorder(statsDe(element).files, 'fichier');
  else if (i.type === 'module') taille = 'ce fichier';
  else if (i.type === 'file') { const nr = (routesParFichier.get(i.f.p) || []).length; taille = nr ? accorder(nr, 'adresse') + ' du serveur' : ''; }
  const recents = recentsDe(element), dedans = recentsDans.get(element.startsWith('m:') ? 'f:' + element.slice(2) : element);
  const pastille = recents ? `<span class="rw">${libelleRecent(recents)}</span>` : dedans ? `<span class="rw soft">${accorder(dedans.length, 'modifié')}</span>` : '';
  return taille || pastille ? `<div class="foot">${taille ? `<span class="meta">${taille}</span>` : '<span></span>'}${pastille}</div>` : '';
}
/** Hauteur supplémentaire dont un bloc a besoin au-delà de sa taille de base : un pied, et un titre assez long pour passer à la ligne. */
function hauteurSupplementaireBloc(element) {
  const i = infosBloc(element);
  const [w] = TAILLES[i.type] || TAILLES.file;
  const nom = i.type === 'route' ? i.r.name : i.type === 'symbol' ? i.s[0] : i.name;
  const place = w - 36 - (i.type === 'route' ? 0 : 40); // marges, et le pictogramme à côté du titre
  return (piedBloc(element) ? HAUTEUR_PIED : 0) + (largeurTexte(nom, 16, 600) > place ? HAUTEUR_TITRE2 : 0);
}
/** Le nombre de points de santé à voir sur ce bloc ou à l'intérieur. La Santé dit lesquels (ui/20-sante.js). */
function pastilleAnomalie(element) {
  const a = ext.anomalies?.(element);
  if (!a?.n) return '';
  return `<span class="alerte ${a.gravite}" title="${a.n === 1 ? '1 point à voir' : `${a.n} points à voir`}">${a.n}</span>`;
}
function blocHTML(element) {
  const i = infosBloc(element);
  let tete = '', titre = '', desc = '', cls = i.type;
  const dsc = (t, lignes = 2) => t ? `<div class="desc" style="--lines:${lignes}">${h(t)}</div>` : `<div class="desc empty">Pas encore de description</div>`;
  if (i.type === 'node') {
    const n = i.n;
    if (n.kind === 'external') cls += ' external';
    tete = `<span class="ico">${picto(clePicto(i))}</span><div class="title">${h(n.label)}</div>`;
    desc = dsc(n.summary, 3);
  } else if (i.type === 'dir') {
    tete = `<span class="ico">${picto('dir')}</span><div class="title">${h(i.name)}</div>`;
    desc = dsc(i.d.files.slice().sort((a, b) => b.loc - a.loc).slice(0, 4).map((f) => f.name).join(', ') + (i.d.files.length > 4 ? ', …' : ''), 2);
  } else if (i.type === 'file' || i.type === 'module') {
    const f = i.f;
    if (f.note) cls += ' has-note';
    tete = `<span class="ico">${picto(clePicto(i))}</span><div class="title">${h(f.name)}</div>`;
    desc = dsc(f.d, 2);
  } else if (i.type === 'route') {
    const r = i.r;
    tete = `<span class="method" style="--m:${varMethode(r.m)}">${h(r.m)}</span><span class="rpath">${h(r.p)}</span>`;
    titre = `<div class="title">${h(r.name)}</div>`;
    desc = dsc(r.d, 2);
  } else if (i.type === 'symbol') {
    tete = `<span class="ico">${picto(i.kind)}</span><div class="title mono">${h(i.s[0])}</div>`;
    desc = i.desc ? dsc(i.desc, 2) : '';
  }
  const note = noteReponse(element);
  const noteHTML = note ? `<div class="anote"><b>${note.n}</b><span>${h(note.text)}</span></div>` : '';
  if (recentsDe(element)) cls += ' recent';
  else if (recentsDans.get(element.startsWith('m:') ? 'f:' + element.slice(2) : element)) cls += ' recent-in';
  return `<div class="card ${cls}" style="--c:${couleurBloc(i)}"><div class="head">${tete}${pastilleAnomalie(element)}</div>${titre}${desc}${noteHTML}${piedBloc(element)}</div>`;
}
function connecteurHTML(c) {
  const i = infosBloc(c.entity);
  return `<div class="card connector" style="--c:${couleurBloc(i)}"><span class="ico">${picto(clePicto(i))}</span><span class="lbl">${h(i.name)}</span><span class="dir-ico">${picto(c.side === 'in' ? 'in' : 'out')}</span></div>`;
}
/** Infobulle d'un bloc au survol : ce que c'est, où il se trouve, et ce qu'on peut en faire. */
function infobulleBloc(id) {
  if (id.startsWith('x:')) {
    const i = infosBloc(entiteConnecteur(id));
    return `<div class="tt">${id.startsWith('x:in') ? 'De' : 'Vers'} ${h(i.name)}</div>${i.desc ? `<div class="td">${h(i.desc)}</div>` : ''}<div class="th"><span>Double-clic pour y aller</span></div>`;
  }
  const i = infosBloc(id);
  if (!modeTechnique()) return `<div class="tt">${h(i.name)}</div>${i.desc ? `<div class="td">${h(i.desc)}</div>` : ''}${infobulleRecent(id)}${ouvrable(id) && etatVue.container !== id ? '<div class="th"><span>Double-clic pour ouvrir</span></div>' : ''}`;
  const st = statsDe(id);
  const genre = i.type === 'node' ? i.kind : i.type === 'route' ? 'endpoint' : i.type === 'symbol' ? i.symKind : i.type === 'module' ? 'file' : i.type;
  const endroit = i.type === 'node' ? (i.n.paths || []).join('\n') : i.type === 'route' ? `${i.f.p}${i.r.h ? ` · ${i.r.h}()` : ''}` : i.path || '';
  const taille = !st?.files ? '' : PLAN ? (i.type === 'file' || i.type === 'module' ? 'prévu' : 'prévu : ' + accorder(st.files, 'fichier')) : i.type === 'file' || i.type === 'module' ? `${formaterNombre(st.loc)} lignes` : `${accorder(st.files, 'fichier')} · ${formaterNombre(st.loc)} lignes`;
  const indications = [ouvrable(id) && etatVue.container !== id ? '<span><span class="kbd">2×clic</span> ouvrir</span>' : '', '<span><span class="kbd">clic droit</span> plus</span>'].join('');
  return `<div class="tt">${h(i.name)}</div><div class="td td-genre">${h(nomGenre(genre))}${taille ? ` · ${taille}` : ''}</div>${endroit ? `<div class="tp">${h(endroit)}</div>` : ''}${infobulleRecent(id)}<div class="th">${indications}</div>`;
}
/** Lignes au survol pour le travail récent : ce qui a changé sur ce bloc et en quoi cela sert la demande, ou ce qui a changé à l'intérieur. */
function infobulleRecent(id) {
  if (!recentVisible) return '';
  const cle = id.startsWith('m:') ? 'f:' + id.slice(2) : id;
  const tache = (t) => h(tachesRecentes[t]?.title || 'Travail récent');
  const recents = recentsPar.get(cle);
  if (recents) return recents.map((x) => `<div class="trw"><div class="trh">${x.change === 'new' ? 'Nouveau' : 'Modifié'} · ${tache(x.task)}</div>${x.note ? `<div class="trn">${h(x.note)}</div>` : ''}</div>`).join('');
  const dedans = recentsDans.get(cle);
  if (!dedans) return '';
  const taches = [...new Set(dedans.flatMap((x) => recentsPar.get(x).map((r) => r.task)))];
  const noms = dedans.slice(0, 3).map((x) => infosBloc(x).name);
  return `<div class="trw"><div class="trh">${dedans.length} modifiés à l'intérieur · ${taches.map(tache).join(', ')}</div><div class="trn">${h(noms.join(', '))}${dedans.length > 3 ? ` et ${dedans.length - 3} de plus` : ''}</div></div>`;
}

