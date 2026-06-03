/**
 * Deploy PrivateVoting to a local network or to testnet.
 *
 *   npm run deploy            # local  (prefunded / SponsoredFPC, no bridging)
 *   npm run deploy:testnet    # testnet (bridges fee juice to fund the deployer
 *                             #          AND the SponsoredFPC the frontend uses)
 *
 * On Aztec, "deploying" is not one step like on Ethereum. It is:
 *   1. register the contract *class* (the code) on the network,
 *   2. deploy an *instance* of that class at a deterministic address,
 *   3. run the instance's public initializer (the `constructor`).
 * The `deploy_instance` region below shows all three happening together.
 *
 * Run with Node 24's native TS support (no ts-node needed):
 *   node scripts/deploy.ts --network <local|testnet>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Fr } from "@aztec/foundation/curves/bn254";
import { TxStatus } from "@aztec/stdlib/tx";

import {
  PrivateVotingContract,
  PrivateVotingContractArtifact,
} from "../packages/contracts/artifacts/PrivateVoting.ts";
import {
  parseNetwork,
  NETWORK_URLS,
  setupWallet,
  loadOrCreateSecret,
  deployAdmin,
  getSalt,
  getSponsoredFPCContract,
  L1_DEFAULTS,
  resolveL1Funder,
  bridgeMode,
} from "../lib/aztec-kit/testing/index.ts";
import { bridgeAndClaim } from "../lib/aztec-kit/bridging/index.ts";

// The demo runs a single election; the contract itself supports many.
const ELECTION_ID = 1n;
// Candidates the frontend renders. (Two of them are, ahem, very hard to tell apart.)
const CANDIDATES = [
  { id: 1n, name: "John Jackson" },
  { id: 2n, name: "Jack Johnson" },
  { id: 3n, name: "Richard Nixon's Head" },
];
// Cosmetic voting deadline shown as a countdown in the UI (display-only; the
// admin actually closes voting on-chain via `end_vote`).
const VOTING_WINDOW_DAYS = 7;
// How much fee juice to bridge into the SponsoredFPC on non-local networks. It
// sponsors every visitor's vote, so size it for the demo (faucet may cap it).
const SPONSOR_FUND_AMOUNT = BigInt("1000000000000000000000"); // 1000 FJ

async function main() {
  const network = parseNetwork();
  const nodeUrl = NETWORK_URLS[network];

  // 1. Wallet + fee payment. On `local` this points fees at the local network
  //    SponsoredFPC; on testnet the deployer pays from its own bridged FJ.
  const { node, wallet, paymentMethod } = await setupWallet(nodeUrl, network);

  // 2. The deployer account. `deployAdmin` is idempotent: it deploys a schnorr
  //    account once (via SponsoredFPC on local, or by bridging fee juice on
  //    testnet) and otherwise returns the existing address.
  const { secretKey, generated } = loadOrCreateSecret("VOTING_ADMIN_SECRET");
  if (generated) {
    console.log(`Generated a deployer secret. Re-export it to reuse this account:`);
    console.log(`  export VOTING_ADMIN_SECRET=${secretKey.toString()}`);
  }
  const admin = await deployAdmin({
    network,
    node,
    wallet,
    secretKey,
    sponsoredPaymentMethod: paymentMethod,
    label: "Voting deployer",
  });

  const currentMinFees = await node.getCurrentMinFees();
  const sendOpts = {
    from: admin,
    fee: { paymentMethod, gasSettings: { maxFeesPerGas: currentMinFees.mul(10) } },
    wait: { timeout: 120, waitForStatus: TxStatus.PROPOSED },
  } as const;

  // docs:start:deploy_instance
  // Deterministic address from (class id, deployer, salt, constructor args), so
  // re-running this script reuses the same contract instead of redeploying.
  const salt = getSalt();
  const deployMethod = PrivateVotingContract.deploy(wallet, admin, { deployer: admin, salt });
  const instance = await deployMethod.getInstance();

  // Always register the instance with our PXE (cheap + idempotent)...
  await wallet.registerContract(instance, PrivateVotingContractArtifact);

  // ...but only send the deploy tx if this address isn't on-chain yet. The deploy
  // tx publishes the class, deploys the instance, and runs the `constructor`.
  const alreadyDeployed = await node.getContract(instance.address);
  if (!alreadyDeployed) {
    console.log(`Deploying PrivateVoting at ${instance.address}...`);
    await deployMethod.send(sendOpts);
  } else {
    console.log(`PrivateVoting already deployed at ${instance.address}, reusing.`);
  }
  // docs:end:deploy_instance

  const voting = PrivateVotingContract.at(instance.address, wallet);

  // Open the demo election so the frontend can cast votes immediately.
  await voting.methods.start_vote({ id: new Fr(ELECTION_ID) }).send(sendOpts);
  console.log(`Election ${ELECTION_ID} is open.`);

  // Fund the SponsoredFPC that the frontend uses to sponsor every visitor's vote.
  // It is a fully private contract — no publication needed; we just credit its
  // address with fee juice (the frontend registers it in its own PXE). On local
  // the network already ships a funded one, so this only runs on testnet/nextnet.
  if (network !== "local") {
    const sponsoredFPC = await getSponsoredFPCContract();
    console.log(`Bridging fee juice into SponsoredFPC ${sponsoredFPC.address}...`);
    const { amount, minted } = await bridgeAndClaim({
      node,
      wallet,
      recipient: sponsoredFPC.address,
      claimFrom: admin,
      l1RpcUrl: L1_DEFAULTS[network].l1RpcUrl,
      l1ChainId: L1_DEFAULTS[network].l1ChainId,
      amount: SPONSOR_FUND_AMOUNT,
      l1PrivateKey: resolveL1Funder(network),
      mode: bridgeMode(network),
      claimFeeOpts: sendOpts.fee,
    });
    console.log(`SponsoredFPC funded with ${amount} FJ (minted=${minted}); votes are sponsored.`);
  }

  // Write the deployment the frontend reads (address + election + candidates).
  const { l1ChainId, rollupVersion } = await node.getNodeInfo();
  const deployment = {
    network,
    nodeUrl,
    chainId: l1ChainId.toString(),
    rollupVersion: rollupVersion.toString(),
    contractAddress: instance.address.toString(),
    // deployer + salt let the frontend rebuild the contract instance to register it.
    deployer: admin.toString(),
    salt: salt.toString(),
    electionId: ELECTION_ID.toString(),
    candidates: CANDIDATES.map((c) => ({ id: c.id.toString(), name: c.name })),
    deadline: new Date(Date.now() + VOTING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  const outDir = join(import.meta.dirname, "..", "packages", "app", "src", "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${network}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log(`\nDeployed PrivateVoting to ${network}.`);
  console.log(`  contract: ${instance.address}`);
  console.log(`  wrote:    ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
