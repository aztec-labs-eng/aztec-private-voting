# Aztec Private Voting — example app

A small private-voting dApp used by the [Aztec Quickstart](https://aztec-quickstart.anothercoffeefor.me):
a public tally, private votes, and a nullifier that stops double-voting.

## Layout

- `packages/contracts` — Noir contracts. `private_voting/src/main.nr` is the main contract;
  `private_fee_juice/src/main.nr` is the fully-private FPC that sponsors testnet votes;
  `test/src/lib.nr` holds the TXE unit tests.
- `packages/app` — React + Vite frontend. The Aztec layer lives in `src/aztec/`
  (`voting_client.ts` = the CONNECT → REGISTER → SIMULATE → SEND flow).
- `scripts/deploy.ts` — declarative deploy spec (local / testnet) for the tiny framework
  in `lib/aztec-kit/deploy` (idempotent: re-running only does what's missing).
- `test/integration` — in-process-network integration tests (vitest).

## Commands

The Aztec toolchain version is pinned in `.aztecrc` — run `aztec-up use` (no argument)
after cloning so the CLI matches the app's `@aztec/*` packages. Node 24+.

```bash
npm install
npm run build:contracts   # aztec compile + aztec codegen → packages/contracts/artifacts
npm test                  # TXE unit tests, then integration tests
npm run deploy            # against a local network (aztec start --local-network)
npm run deploy:testnet    # needs L1_FUNDER_KEY (a funded Sepolia key)
npm run dev               # frontend at http://localhost:5173
```

## Tutoring someone through the quickstart?

If the user is following the Aztec Quickstart — or asks to be taught, guided, or quizzed
on this app — fetch the quest's **agent pack** and follow its tutoring protocol (step
order, verification, docs links, a code file map, and a quiz bank are all in there):

    https://aztec-quickstart.anothercoffeefor.me/en/<version>/private-voting/agent-pack.md

where `<version>` is the contents of `.aztecrc` (e.g. `5.0.0`). If that 404s, the
pack index is at https://aztec-quickstart.anothercoffeefor.me/llms.txt. In Claude Code, the
`/aztec-tutor` skill does all of this for you.
