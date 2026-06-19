/**
 * Loads the deployment written by `npm run deploy` (src/deployments/<network>.json).
 * Returns null when nothing has been deployed yet, so the UI can show a hint
 * instead of crashing the build on a missing import.
 */
import { Fr } from "@aztec/aztec.js/fields";

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
  electionId: string;
  candidates: Candidate[];
  fpcAddress?: string;
}

/**
 * The `ElectionId` argument the contract methods expect, derived from whichever
 * deployment (network) we're connected to — each network's JSON carries its own
 * `electionId`, so the right election follows from the chosen deployment.
 */
export function election(deployment: Deployment): { id: Fr } {
  return { id: new Fr(BigInt(deployment.electionId)) };
}

// Deployments are written by `npm run deploy` to `src/deployments/<network>.json`.
// This file lives in `src/aztec/`, so the glob reaches up one level.
const files = import.meta.glob<Deployment>("../deployments/*.json", {
  eager: true,
  import: "default",
});

// Guards against an outdated deployment file from an older deploy script: the
// format signal is the candidate shape ({id,name}).
function isCurrent(d: Deployment | undefined): d is Deployment {
  return (
    !!d &&
    typeof d.contractAddress === "string" &&
    Array.isArray(d.candidates) &&
    d.candidates.every(
      (c) => c && typeof c === "object" && "id" in c && "name" in c,
    )
  );
}

/** All current deployments (one per `src/deployments/<network>.json`), local first. */
export function loadDeployments(): Deployment[] {
  return Object.entries(files)
    .filter(([, d]) => {
      if (isCurrent(d)) return true;
      console.warn(
        "Ignoring an outdated deployment file. Re-run `npm run deploy`.",
      );
      return false;
    })
    .map(([, d]) => d)
    .sort((a, b) =>
      a.network === "local"
        ? -1
        : b.network === "local"
          ? 1
          : a.network.localeCompare(b.network),
    );
}

/** The default deployment (local if present, else the first available). */
export function loadDeployment(): Deployment | null {
  return loadDeployments()[0] ?? null;
}
