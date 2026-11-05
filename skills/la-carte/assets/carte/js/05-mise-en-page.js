// ======================= mise en page =======================
const mesure = document.createElement('canvas').getContext('2d');
const largeurTexte = (s, px = 12, w = 500) => { mesure.font = `${w} ${px}px Inter, system-ui, sans-serif`; return mesure.measureText(s).width; };

// sur un téléphone, le schéma n'est pas affiché : seul l'ordre compte, et il ne demande aucun calcul de disposition
function disposerColonne(vue) {
  const ids = [...vue.visible.map((id) => (typeof id === 'string' ? id : id.id)), ...vue.connectors.map((c) => c.id)];
  const rang = new Map(ids.map((id) => [id, 0]));
  for (let tour = 0; tour < ids.length; tour++) {
    let change = false;
    for (const e of vue.edges) if (rang.has(e.a) && rang.has(e.b) && rang.get(e.b) <= rang.get(e.a) && rang.get(e.a) < ids.length) { rang.set(e.b, rang.get(e.a) + 1); change = true; }
    if (!change) break;
  }
  const dernier = Math.max(0, ...rang.values()) + 1;
  for (const c of vue.connectors) rang.set(c.id, c.side === 'in' ? -1 : dernier);
  const children = ids.map((id, n) => ({ id, x: rang.get(id) * 300, y: n * 100, width: 240, height: 80 }));
  return { children, edges: [], width: (dernier + 2) * 300, height: ids.length * 100 };
}

const dispositionsCalculees = new Map();
async function disposer(vue) {
  if (modeColonne()) return disposerColonne(vue);
  const deg = new Map();
  const incrementer = (id) => deg.set(id, (deg.get(id) || 0) + 1);
  for (const e of vue.edges) { incrementer(e.a); incrementer(e.b); }
  const enfantsElk = [];
  for (const element of vue.visible) {
    const [w, hh] = TAILLES[infosBloc(element).type] || TAILLES.file;
    const ext = element.startsWith('n:') && noeudsParId.get(element.slice(2)).kind === 'external';
    enfantsElk.push({ id: element, width: w, height: Math.max(hh + hauteurSupplementaireBloc(element) + (noteReponse(element) ? HAUTEUR_NOTE : 0), (deg.get(element) || 0) * 7 + 28), ...(ext ? { layoutOptions: { 'elk.layered.layering.layerConstraint': 'LAST' } } : {}) });
  }
  for (const c of vue.connectors) {
    enfantsElk.push({ id: c.id, width: borner(largeurTexte(infosBloc(c.entity).name, 22) + 96, 230, 460), height: Math.max(76, (deg.get(c.id) || 0) * 7 + 14),
      layoutOptions: { 'elk.layered.layering.layerConstraint': c.side === 'in' ? 'FIRST_SEPARATE' : 'LAST_SEPARATE' } });
  }
  const entree = {
    id: 'g', children: enfantsElk,
    edges: vue.edges.map((e) => ({ id: e.id, sources: [e.a], targets: [e.b] })),
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '130', 'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8', 'elk.spacing.edgeEdge': '8', 'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': vue.edges.length > 150 ? '4' : '12', // une grande vue cherche moins longtemps à éviter les croisements 'elk.separateConnectedComponents': 'true', 'elk.spacing.componentComponent': '80',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
  };
  // revenir sur une vue déjà vue est immédiat : son calcul est gardé tant que la page reste ouverte
  const cle = JSON.stringify(entree);
  if (!dispositionsCalculees.has(cle)) {
    if (dispositionsCalculees.size >= 40) dispositionsCalculees.delete(dispositionsCalculees.keys().next().value);
    dispositionsCalculees.set(cle, elk.layout(entree));
  }
  return dispositionsCalculees.get(cle);
}

