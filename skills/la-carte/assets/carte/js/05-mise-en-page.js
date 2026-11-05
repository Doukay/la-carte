// ======================= mise en page =======================
const mesure = document.createElement('canvas').getContext('2d');
const largeurTexte = (s, px = 12, w = 500) => { mesure.font = `${w} ${px}px Inter, system-ui, sans-serif`; return mesure.measureText(s).width; };

async function disposer(vue) {
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
  return elk.layout({
    id: 'g', children: enfantsElk,
    edges: vue.edges.map((e) => ({ id: e.id, sources: [e.a], targets: [e.b] })),
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '130', 'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8', 'elk.spacing.edgeEdge': '8', 'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '12', 'elk.separateConnectedComponents': 'true', 'elk.spacing.componentComponent': '80',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
  });
}

