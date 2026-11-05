// ======================= modèle =======================
const noeudsParId = new Map(G.nodes.map((n) => [n.id, n]));
const fichiersParChemin = new Map(G.files.map((f) => [f.p, f]));
const routes = G.routes || [];
const parentsParId = new Map();
const fils = new Map();
const ajouterEnfant = (p, element) => { parentsParId.set(element, p); if (!fils.has(p)) fils.set(p, []); fils.get(p).push(element); };
const dossiers = new Map();

for (const n of G.nodes) ajouterEnfant(n.parent ? 'n:' + n.parent : 'root', 'n:' + n.id);
const fichiersParNoeud = new Map();
for (const f of G.files) { if (!fichiersParNoeud.has(f.n)) fichiersParNoeud.set(f.n, []); fichiersParNoeud.get(f.n).push(f); }
const SEUIL_GROUPE = 24;
for (const [idNoeud, liste] of fichiersParNoeud) {
  const parent = 'n:' + idNoeud;
  if (liste.length <= SEUIL_GROUPE) { liste.forEach((f) => ajouterEnfant(parent, 'f:' + f.p)); continue; }
  const dossiersDe = liste.map((f) => nomDossier(f.p).split('/'));
  let commun = dossiersDe[0].slice();
  for (const d of dossiersDe) { let i = 0; while (i < commun.length && d[i] === commun[i]) i++; commun = commun.slice(0, i); }
  const groupes = new Map();
  liste.forEach((f, i) => {
    const seg = dossiersDe[i][commun.length];
    const cle = seg === undefined ? '' : [...commun, seg].join('/');
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(f);
  });
  for (const [cle, fs] of groupes) {
    if (!cle || fs.length < 2) { fs.forEach((f) => ajouterEnfant(parent, 'f:' + f.p)); continue; }
    const idDossier = `d:${idNoeud}|${cle}`;
    dossiers.set(idDossier, { node: idNoeud, path: cle, files: fs });
    ajouterEnfant(parent, idDossier);
    fs.forEach((f) => ajouterEnfant(idDossier, 'f:' + f.p));
  }
}
// dans un fichier : ses adresses du serveur, puis les exports qui ne sont pas des gestionnaires de route
const routesParFichier = new Map();
routes.forEach((r, i) => { if (!routesParFichier.has(r.f)) routesParFichier.set(r.f, []); routesParFichier.get(r.f).push(i); });
for (const f of G.files) {
  const rs = routesParFichier.get(f.p) || [];
  const gestionnaires = new Set(rs.map((i) => routes[i].h));
  rs.forEach((i) => ajouterEnfant('f:' + f.p, 'r:' + i));
  (f.s || []).forEach((s, i) => { if (!gestionnaires.has(s[0])) ajouterEnfant('f:' + f.p, `s:${f.p}#${i}`); });
}

const cacheLignee = new Map();
function lignee(element) {
  if (cacheLignee.has(element)) return cacheLignee.get(element);
  const sortie = [element];
  let p = parentsParId.get(element);
  while (p && p !== 'root') { sortie.push(p); p = parentsParId.get(p); }
  if (element !== 'root') sortie.push('root');
  cacheLignee.set(element, sortie);
  return sortie;
}
// Travail récent (G.recent) : les blocs que Claude vient de modifier, et combien de modifications se trouvent dans chaque partie
const tachesRecentes = G.recent?.tasks || [];
const recentsPar = new Map();
for (const it of G.recent?.items || []) { if (!parentsParId.has(it.id)) continue; if (!recentsPar.has(it.id)) recentsPar.set(it.id, []); recentsPar.get(it.id).push(it); }
const recentsDans = new Map();
for (const id of recentsPar.keys()) for (const a of lignee(id).slice(1)) if (a !== 'root') { if (!recentsDans.has(a)) recentsDans.set(a, []); recentsDans.get(a).push(id); }
const recentsDe = (element) => recentsPar.get(element.startsWith('m:') ? 'f:' + element.slice(2) : element);
const libelleRecent = (liste) => (liste.some((x) => x.change === 'new') ? 'Nouveau' : 'Modifié');
let recentVisible = !!stockageLocal.get('recent-hl', true);
const reglerRecentVisible = (on) => { recentVisible = on; stockageLocal.set('recent-hl', on); document.body.classList.toggle('no-recent', !on); };
document.body.classList.toggle('no-recent', !recentVisible);
const symboleDe = (element) => { const m = /^s:(.*)#(\d+)$/.exec(element); const f = fichiersParChemin.get(m[1]); return { f, s: f.s[+m[2]] }; };
function humaniser(s) { s = s.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

function infosBloc(element) {
  if (element === 'root') return { type: 'root', name: G.projet.name, desc: G.projet.summary || '', kind: 'root' };
  if (element === 'q:answer') return { type: 'answer', name: etatVue.answer?.title || 'Réponse', desc: etatVue.answer?.question || '', kind: 'answer' };
  const t = element.slice(0, 2);
  if (t === 'n:') { const n = noeudsParId.get(element.slice(2)); return { type: 'node', name: n.label, desc: n.summary, kind: n.kind, n }; }
  if (t === 'd:') { const d = dossiers.get(element); return { type: 'dir', name: humaniser(d.path.split('/').pop()), desc: `${accorder(d.files.length, 'fichier')} dans ${d.path}/`, kind: 'dir', d, path: d.path + '/' }; }
  if (t === 'f:') { const f = fichiersParChemin.get(element.slice(2)); return { type: 'file', name: f.name, desc: f.d, kind: 'file', f, path: f.p }; }
  if (t === 'm:') { const f = fichiersParChemin.get(element.slice(2)); return { type: 'module', name: f.name, desc: f.d, kind: 'module', f, path: f.p }; }
  if (t === 'r:') { const r = routes[+element.slice(2)]; return { type: 'route', name: r.name, desc: r.d, kind: 'route', r, f: fichiersParChemin.get(r.f), path: `${r.m} ${r.p}` }; }
  if (t === 's:') { const { f, s } = symboleDe(element); return { type: 'symbol', name: s[0], desc: s[4] || '', kind: pictoSymbole(s[1]), symKind: s[1], f, s, path: `${f.p}:${s[2]}` }; }
  return { type: 'unknown', name: element, desc: '', kind: 'misc' };
}
const entiteConnecteur = (id) => id.replace(/^x:(in|out):/, '');
const nomDe = (element) => infosBloc(element.startsWith('x:') ? entiteConnecteur(element) : element).name;
// en mode simple, un fichier ne s'ouvre que s'il a des adresses du serveur à montrer (ses exports sont du détail de développeur)
const filsVisibles = (element) => (fils.get(element) || []).filter((k) => modeTechnique() || !k.startsWith('s:'));
const ouvrable = (element) => /^(n:|d:|f:)/.test(element) && filsVisibles(element).length > 0;
const varMethode = (m) => `var(--m-${m in METHODES ? m : 'ANY'})`;
/** La couleur d'un bloc est celle de son groupe : les blocs à l'intérieur d'une partie prennent la couleur de la partie de premier niveau. */
function genreDuGroupe(i) {
  const noeud = i.type === 'node' ? i.n.id : i.type === 'dir' ? i.d.node : i.type === 'file' || i.type === 'module' ? i.f.n : null;
  if (!noeud) return null;
  const chaine = lignee('n:' + noeud), haut = chaine[chaine.length - 2];
  return (haut && infosBloc(haut).kind) || (i.type === 'node' ? i.kind : null);
}
const couleurBloc = (i) => i.type === 'route' ? varMethode(i.r.m) : `var(--n-${i.type === 'symbol' ? 'symbol' : genreDuGroupe(i) || i.type})`;
const clePicto = (i) => i.type === 'node' ? (P[i.n.icon] ? i.n.icon : i.kind) : i.type === 'symbol' ? i.kind : (i.type === 'file' || i.type === 'module') && P[i.f.icon] ? i.f.icon : i.type;

function statsDe(element) {
  const i = infosBloc(element);
  if (i.type === 'node') return i.n.stats;
  if (i.type === 'dir') return { files: i.d.files.length, loc: i.d.files.reduce((s, f) => s + f.loc, 0) };
  if (i.type === 'file' || i.type === 'module') return { files: 1, loc: i.f.loc };
  return null;
}

