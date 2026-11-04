// Quel agent de code fait tourner le skill : Claude Code ou Codex. La carte l’enregistre, pour que sa bulle de questions et
// ses demandes « Corriger avec … » nomment le bon, et pour que serve.mjs réponde par la même CLI.
// --agent <nom> (ou FLOORPLAN_AGENT) décide ; sinon chaque agent se reconnaît aux variables qu’il définit
// pour chaque commande qu’il lance, et tout le reste est pris pour Claude Code. Ajouter un agent, c’est ajouter une entrée ici.
const DETECTION = {
  claude: () => false, // celui par défaut
  codex: (env) => !!(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID),
};
export const AGENTS = Object.keys(DETECTION);

export function detecterAgent(params = {}, env = process.env) {
  const v = String(params.agent || env.FLOORPLAN_AGENT || '').toLowerCase();
  if (AGENTS.includes(v)) return v;
  return AGENTS.find((a) => DETECTION[a](env)) || 'claude';
}
