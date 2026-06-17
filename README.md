# Private Voting — Aztec Quickstart Example App

A deliberately small Aztec app that teaches the one idea Aztec is built around: a
**public/private split guarded by a nullifier**.

- Votes are cast in **private** — nobody learns who you voted for.
- The only thing that ever becomes **public** is the aggregate **tally**.
- A **nullifier** (one per election + voter) makes it impossible to vote twice,
  without revealing that _you_ were the one who voted.

This is the example app consumed by the Aztec quickstart website; it walks a learner
through _install → clone → understand → test → deploy_.

## Layout

```
packages/
  contracts/            Noir contract + generated TypeScript artifact
    contract/src/main.nr  the PrivateVoting contract  (docs regions live here)
    test/src/lib.nr       TXE unit tests  (separate crate, per aztec-packages#20681)
    artifacts/            committed codegen output (PrivateVoting.ts)
  app/                  React + Vite 8 + vanilla-extract frontend
    src/App.tsx           candidate list, donut chart, live event feed
    src/aztec/            the Aztec layer: aztec.ts (the whole SDK flow, docs regions) + deployment.ts
    src/components/       SetupModal, StepProgress, VoteChart
scripts/
  deploy.ts             deploy to local / testnet (idempotent)
  update.ts             bump the pinned Aztec version everywhere
test/integration/       in-process-network integration test (vitest)
lib/aztec-kit/          vendored bridging + in-process helpers (temporary; see its README)
```

Clear frontend↔contracts separation via plain **npm workspaces** — no yarn, no turbo.

## Prerequisites

- **Node 24** (`nvm use` picks it up from `.nvmrc`).
- The **Aztec toolchain** matching the pinned version (see _Versioning_): `aztec-up`.

## Commands

```bash
npm install              # install workspaces
npm run compile          # aztec compile   (Noir -> ACIR)
npm run codegen          # aztec codegen   (-> packages/contracts/artifacts/PrivateVoting.ts)
npm test                 # TXE unit tests + in-process integration test
npm run deploy           # deploy to a local network (prefunded / SponsoredFPC)
npm run deploy:testnet   # deploy to testnet (bridges fee juice to fund the deployer)
npm run dev              # run the frontend (http://localhost:5173)
```

### Local end-to-end

```bash
aztec start --local-network      # in one terminal
npm run deploy             # writes packages/app/src/deployments/local.json
npm run dev                # open the app, cast a vote, watch the tally tick up
```

## How "deploying" differs from Ethereum

On Ethereum you send one tx and your contract is live. On Aztec, `scripts/deploy.ts`
(`deploy_instance` region) does three things:

1. **register the contract class** (the code) on the network,
2. **deploy an instance** of that class at a deterministic address,
3. run the instance's **public initializer** (the `constructor`).

The script is **idempotent**: the instance address is a function of (class, deployer,
salt, constructor args), so re-running it reuses the existing contract instead of
redeploying.

## Fees & privacy

- **Local:** prefunded test accounts / the local-network `SponsoredFPC` pay the gas — no
  bridging, anvil/forge-familiar.
- **Testnet:** `deploy:testnet` bridges fee juice from L1 twice — once to fund the
  **deployer** account, and once to fund the **SponsoredFPC** (a fully private contract;
  no publication, we just credit its address). The frontend then sponsors every visitor's
  vote through that FPC, so users need no fee juice of their own. Privacy note: the
  _operator's_ bridged funding links the operator's L1↔L2 txs, but visitors stay private —
  their votes are nullifier-private and paid by the shared FPC.

## Test tiers

| Tier                                 | Where                                | Run with                                |
| ------------------------------------ | ------------------------------------ | --------------------------------------- |
| **TXE unit**                         | `packages/contracts/test/src/lib.nr` | `npm run test:contracts` (`aztec test`) |
| **Integration** (in-process network) | `test/integration/`                  | `npm run test:integration`              |
| **E2E** (browser)                    | —                                    | side-quest follow-up                    |

The unit tests cover the pedagogy directly: a vote bumps the tally, a **second vote from
the same account fails on a duplicate nullifier**, and `end_vote` is admin-gated.

## Versioning (two branches, like aztec-kit)

One Aztec version is the single source of truth per branch — every `@aztec/*` dep **and**
the `Nargo.toml` git `tag` move together via `npm run update -- --version <v>`. The pinned
toolchain version also lives in **`.aztecrc`**, so `aztec-up use` (no argument) selects it.

| Branch | Aztec version                                 |
| ------ | --------------------------------------------- |
| `main` | **v5** release cycle — currently `5.0.0-rc.1` |
| `next` | reserved for **v6**                           |

```bash
aztec-up use            # reads .aztecrc -> switches to this branch's toolchain
```

> **Bumping the version:** `npm run update -- --version <v>`, update both `.aztecrc`
> files, `aztec-up install <v>`, `npm install`, then **clear the stale `bb` VK cache and
> recompile** before testing:
>
> ```bash
> rm -rf ~/.bb packages/contracts/target && npm run build:contracts
> ```
>
> Skipping that bites: `bb` caches verification keys under `~/.bb/<bb-version>/`, and a
> VK left over from a different toolchain surfaces as `verification key has wrong size`
> (or "function artifact not found") in the TXE / integration tests. Always clean-recompile
> on a version change.
>
> If a clean recompile _still_ shows a VK size mismatch (e.g. compiler emits 5216 but the
> TXE/`bb.js` expect 4576), the active toolchain's `bb` doesn't match the published npm
> `bb.js` — e.g. you have a locally/privately-built toolchain installed under the same
> version number. Reinstall the published one: `aztec-up uninstall <v> && aztec-up install <v>`.

## For the quickstart site

The site inlines named regions via `#include_code` (fail-closed). Current regions:

| File                                      | regions                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `packages/contracts/contract/src/main.nr` | `storage_struct`, `cast_vote`, `add_to_tally`      |
| `packages/app/src/aztec/aztec.ts`         | `register_contract`, `simulate_query`, `send_vote` |
| `scripts/deploy.ts`                       | `deploy_instance`                                  |

`snippetRoots` should point at `packages/contracts/contract/`, `packages/app/src/`, and
`scripts/`. Commands in content use `npm run …`.

## TODO / follow-ups

- **Drop the vendored `lib/aztec-kit/`** (bridging + in-process-network test helpers) once
  aztec.js ships equivalents — then import them from `@aztec/aztec.js` and delete the folder.
- **Remove the per-package `packages/contracts/.aztecrc`** once the upstream `aztec-up` bug is
  fixed: the npm `@aztec/aztec` launcher only looks for `.aztecrc` in the _current_ directory,
  so in a workspace (where `.aztecrc` is at the repo root and `npm run` builds run from the
  package dir) it bypasses the pinned toolchain and transpiles with a mismatched `node_modules`
  `bb` → "different wire format". The real fix is to make the launcher resolve `.aztecrc` by
  walking up the tree (like `nvm`/`git`); the per-package `.aztecrc` is a stopgap until then.
- **Testnet bridging deploy** (`npm run deploy:testnet`) is type- and API-verified against
  4.3.0 but not yet run end-to-end against the live testnet (needs Sepolia L1 + the fee-juice
  faucet). Shake it out once before relying on it.
- **E2E (Playwright) tier** is still a stub — wire it up against a local network as a side quest.
- **Reconcile committed artifacts vs `target/`:** `artifacts/PrivateVoting.ts` imports
  `../target/*.json`, which is gitignored — a fresh clone must `npm run compile` before the TS
  resolves. Decide whether to commit the compiled JSON or codegen on install.
