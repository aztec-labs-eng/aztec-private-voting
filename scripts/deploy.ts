/**
 * Deploy PrivateVoting with the minimal declarative deploy framework (lib/aztec-kit/deploy).
 *
 *   npm run deploy            # local   (SponsoredFPC pays, no bridging)
 *   npm run deploy:testnet    # testnet  (deployer pays from its own Fee Juice, topping up
 *                             #           from L1 when its balance is low)
 *
 * This file is just the *spec* — one graph of steps (the contracts that must end up on-chain
 * and the txs to send) plus how fees are paid. The engine (resolve → inventory → fund → execute
 * → output) lives in lib/aztec-kit/deploy and runs it idempotently: re-running only does what's
 * still missing. Accounts are initializerless (no account-deploy tx); the frontend pays via the
 * fully-private PrivateFeeJuice FPC whose address this records. Testnet bridging hits L1 (Sepolia) — set `L1_FUNDER_KEY`
 * to a funded Sepolia key, and `L1_RPC_URL` to override the default public RPC if it's slow.
 *
 * Run with Node 24's native TS support: `node scripts/deploy.ts --network <local|testnet>`.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Fr } from "@aztec/foundation/curves/bn254";

import { PrivateVotingContract } from "../packages/contracts/artifacts/PrivateVoting.ts";
import { PrivateFeeJuiceContract } from "../packages/contracts/artifacts/PrivateFeeJuice.ts";
import { runDeployment } from "../lib/aztec-kit/deploy/index.ts";
import type { Ctx, FeePolicy } from "../lib/aztec-kit/deploy/index.ts";
import type { NetworkName } from "../lib/aztec-kit/testing/network-config.ts";

// The demo runs a single election; the contract itself supports many.
const ELECTION_ID = 1n;
const ELECTION = { id: new Fr(ELECTION_ID) };
// Candidates the frontend renders. (Two of them are, ahem, very hard to tell apart.)
const CANDIDATES = [
  { id: 1n, name: "John Jackson" },
  { id: 2n, name: "Jack Johnson" },
  { id: 3n, name: "Richard Nixon's Head" },
];
// Deterministic salt for the (fully private) PrivateFeeJuice FPC the frontend pays through.
const FPC_SALT = new Fr(0x1234n);
const NETWORK_URLS: Record<NetworkName, string> = {
  local: "http://localhost:8080",
  testnet: "https://canonical.testnet.rpc.aztec-labs.com",
};

function parseNetwork(): NetworkName {
  const idx = process.argv.indexOf("--network");
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value || !(value in NETWORK_URLS)) {
    throw new Error(`Pass --network <${Object.keys(NETWORK_URLS).join("|")}>`);
  }
  return value as NetworkName;
}

// The framework never reads the environment — this script (the caller) resolves secrets and
// config here and pipes them into the spec.

/** The deployer secret from `VOTING_ADMIN_SECRET`, generating + logging a fresh one if unset. */
function loadOrCreateSecret(envVar: string): Fr {
  const env = process.env[envVar];
  if (env) return Fr.fromString(env);
  const secret = Fr.random();
  console.log(
    "Generated a deployer secret. Re-export it to reuse this account:",
  );
  console.log(`  export ${envVar}=${secret.toString()}`);
  return secret;
}

/** Universal salt from `SALT` (defaults to 0) for reproducible addresses across re-runs. */
function getSalt(): Fr {
  const env = process.env.SALT;
  return env ? Fr.fromString(env) : new Fr(0);
}

const ONE_FEE_JUICE = 10n ** 18n;

/**
 * Fee policy: SponsoredFPC on local, the deployer's own Fee Juice on testnet (bridging from L1
 * if low). The L1 funder key / RPC are piped in from the env here — the framework never reads it.
 */
function feePolicy(network: NetworkName): FeePolicy {
  if (network === "local") return { kind: "sponsored" };
  return {
    kind: "fee-juice",
    threshold: 100n * ONE_FEE_JUICE,
    fundAmount: 1000n * ONE_FEE_JUICE,
    l1FunderKey: process.env.L1_FUNDER_KEY as `0x${string}` | undefined,
    l1RpcUrl: process.env.L1_RPC_URL,
  };
}

/** Write the deployment JSON the frontend reads (address + election + candidates [+ FPC]). */
async function writeAppDeployment(
  network: NetworkName,
  nodeUrl: string,
  ctx: Ctx,
): Promise<void> {
  const { l1ChainId, rollupVersion } = await ctx.node.getNodeInfo();
  const deployment = {
    network,
    nodeUrl,
    chainId: l1ChainId.toString(),
    rollupVersion: rollupVersion.toString(),
    contractAddress: ctx.contract("voting").toString(),
    electionId: ELECTION_ID.toString(),
    candidates: CANDIDATES.map((c) => ({ id: c.id.toString(), name: c.name })),
    // On local the frontend uses the SponsoredFPC, so no FPC fields are written.
    ...(network === "local"
      ? {}
      : {
          fpcAddress: ctx.contract("fpc").toString(),
          fpcSalt: FPC_SALT.toString(),
        }),
  };
  const outPath = join(
    import.meta.dirname,
    "..",
    "packages",
    "app",
    "src",
    "deployments",
    `${network}.json`,
  );
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`  wrote           ${outPath}`);
}

async function main() {
  const network = parseNetwork();
  const nodeUrl = NETWORK_URLS[network];

  await runDeployment({
    network,
    nodeUrl,
    salt: getSalt(),
    accounts: { admin: { secret: loadOrCreateSecret("VOTING_ADMIN_SECRET") } },
    fees: feePolicy(network),
    // One graph of steps — contracts to put on-chain and the txs to send.
    steps: {
      // The voting contract is published on-chain; its initializer takes the admin address.
      voting: {
        kind: "contract",
        contract: PrivateVotingContract,
        deployer: (resolve) => resolve.account("admin"),
        initializerArgs: (resolve) => [resolve.account("admin")],
        mode: "publish",
      },
      // Off local, the frontend pays via this fully-private FPC. We only need its
      // deterministic address (no tx); the frontend rebuilds + registers it itself.
      ...(network === "local"
        ? {}
        : {
            fpc: {
              kind: "contract" as const,
              contract: PrivateFeeJuiceContract,
              deployer: (resolve) => resolve.account("admin"),
              salt: FPC_SALT,
              mode: "register" as const,
            },
          }),
      // Open the demo election so the frontend can cast votes immediately. `vote_active`
      // is the idempotency gate — `start_vote` reverts if called twice.
      startVote: {
        kind: "action",
        from: (resolve) => resolve.account("admin"),
        dependsOn: ["voting"],
        call: (ctx) => ctx.instance("voting").methods.start_vote(ELECTION),
        done: async (ctx) => {
          const { result } = await ctx
            .instance("voting")
            .methods.vote_active(ELECTION)
            .simulate({ from: ctx.account("admin") });
          return Boolean(result);
        },
      },
    },
    output: (ctx) => writeAppDeployment(network, nodeUrl, ctx),
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
