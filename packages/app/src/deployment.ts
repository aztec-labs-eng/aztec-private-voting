/**
 * Loads the deployment written by `npm run deploy` (src/deployments/<network>.json).
 * Returns null when nothing has been deployed yet, so the UI can show a hint
 * instead of crashing the build on a missing import.
 */
export interface Deployment {
  network: string;
  nodeUrl: string;
  chainId: string;
  rollupVersion: string;
  contractAddress: string;
  deployer: string;
  salt: string;
  electionId: string;
  candidates: string[];
}

const files = import.meta.glob<Deployment>("./deployments/*.json", {
  eager: true,
  import: "default",
});

export function loadDeployment(): Deployment | null {
  // Prefer local, else whatever single deployment exists.
  const local = files["./deployments/local.json"];
  if (local) return local;
  const all = Object.values(files);
  return all.length > 0 ? all[0] : null;
}
