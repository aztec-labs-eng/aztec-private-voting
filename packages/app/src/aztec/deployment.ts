/**
 * Loads the deployment written by `npm run deploy` (src/deployments/<network>.json).
 * Returns null when nothing has been deployed yet, so the UI can show a hint
 * instead of crashing the build on a missing import.
 */
export interface Candidate {
  id: string;
  name: string;
}

export interface Deployment {
  network: string;
  nodeUrl: string;
  chainId: string;
  rollupVersion: string;
  contractAddress: string;
  deployer: string;
  salt: string;
  electionId: string;
  candidates: Candidate[];
  /** ISO timestamp; display-only countdown. */
  deadline: string;
}

// Deployments are written by `npm run deploy` to `src/deployments/<network>.json`.
// This file lives in `src/aztec/`, so the glob reaches up one level.
const files = import.meta.glob<Deployment>("../deployments/*.json", {
  eager: true,
  import: "default",
});

/** Guards against an outdated deployment file from an older deploy script. */
function isCurrent(d: Deployment | undefined): d is Deployment {
  return (
    !!d &&
    typeof d.contractAddress === "string" &&
    typeof d.deadline === "string" &&
    Array.isArray(d.candidates) &&
    d.candidates.every((c) => c && typeof c === "object" && "id" in c && "name" in c)
  );
}

export function loadDeployment(): Deployment | null {
  // Prefer local, else whatever single deployment exists.
  const candidate = files["../deployments/local.json"] ?? Object.values(files)[0];
  if (!candidate) return null;
  if (!isCurrent(candidate)) {
    console.warn("Ignoring an outdated deployment file. Re-run `npm run deploy`.");
    return null;
  }
  return candidate;
}
