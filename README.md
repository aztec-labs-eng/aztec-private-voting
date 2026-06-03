# Private Voting — Aztec Quickstart Example App

A deliberately small Aztec app that teaches the one idea Aztec is built around: a
**public/private split guarded by a nullifier**.

- Votes are cast in **private** — nobody learns who you voted for.
- The only thing that ever becomes **public** is the aggregate **tally**.
- A **nullifier** (one per election + voter) makes it impossible to vote twice,
  without revealing that *you* were the one who voted.

This is the example app consumed by the Aztec quickstart website; it walks a learner
through *install → clone → understand → test → deploy*.

## Layout

```
packages/
  contracts/            Noir contract + generated TypeScript artifact
    contract/src/main.nr  the PrivateVoting contract  (docs regions live here)
    test/src/lib.nr       TXE unit tests  (separate crate, per aztec-packages#20681)
    artifacts/            committed codegen output (PrivateVoting.ts)
  app/                  React + Vite 8 + vanilla-extract frontend
    src/App.tsx           candidate list, donut chart, deadline countdown
    src/aztec/            the Aztec layer: wallet, voting (docs regions), setup, deployment
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
- The **Aztec toolchain** matching the pinned version (see *Versioning*): `aztec-up`.

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
- **Testnet:** the deployer self-bridges fee juice from L1 (handled by the vendored
  `bridge()` helper). Note the privacy trade-off: paying with your own bridged fee juice
  links your transactions. For voting it barely matters — the vote itself is
  nullifier-private; only the fact that *an* address transacted leaks.

## Test tiers

| Tier | Where | Run with |
| --- | --- | --- |
| **TXE unit** | `packages/contracts/test/src/lib.nr` | `npm run test:contracts` (`aztec test`) |
| **Integration** (in-process network) | `test/integration/` | `npm run test:integration` |
| **E2E** (browser) | — | side-quest follow-up |

The unit tests cover the pedagogy directly: a vote bumps the tally, a **second vote from
the same account fails on a duplicate nullifier**, and `end_vote` is admin-gated.

## Versioning (two branches, like aztec-kit)

One Aztec version is the single source of truth per branch — every `@aztec/*` dep **and**
the `Nargo.toml` git `tag` move together via `npm run update -- --version <v>`. The pinned
toolchain version also lives in **`.aztecrc`**, so `aztec-up use` (no argument) selects it.

| Branch | Aztec version |
| --- | --- |
| `main` | **4.3.0** (stable) |
| `next` | latest **v5 nightly** |

```bash
aztec-up use            # reads .aztecrc -> switches to this branch's toolchain
```

> To re-pin to a new version: `npm run update -- --version <v>`, update `.aztecrc`,
> then `aztec-up install <v>`, `npm install`, and `npm run build:contracts`.

## For the quickstart site

The site inlines named regions via `#include_code` (fail-closed). Current regions:

| File | regions |
| --- | --- |
| `packages/contracts/contract/src/main.nr` | `storage_struct`, `cast_vote`, `add_to_tally` |
| `packages/app/src/aztec/voting.ts` | `register_contract`, `simulate_query`, `send_vote` |
| `scripts/deploy.ts` | `deploy_instance` |

`snippetRoots` should point at `packages/contracts/contract/`, `packages/app/src/`, and
`scripts/`. Commands in content use `npm run …`.
