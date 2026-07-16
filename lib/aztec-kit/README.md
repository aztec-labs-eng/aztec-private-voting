# `lib/aztec-kit` — vendored helpers (temporary)

These files are **adapted from [aztec-kit](https://github.com/AztecProtocol/aztec-kit)**
(`packages/common/src`). They cover things aztec.js doesn't yet give you out of the box
and that you don't want to reinvent:

- **`deploy/`** — a small declarative deploy framework (`runDeployment`): resolve
  accounts + deterministic addresses, inventory what's on-chain, fund, and run only
  what's missing. Includes `network-config.ts`, the per-network L1 constants.
- **`bridging/`** — the L1→L2 fee-juice bridge flow (`bridge`), used to fund a deployer
  on testnet.
- **`node/`** — a thin Aztec node-client factory.

The in-process local network for integration tests is **not** vendored: it comes from
`@aztec/aztec/testing` (`setupLocalNetwork`), which the tests import directly.

They are intentionally quarantined here so the example app's *own* code (the contract,
the deploy script, the frontend) stays small and readable. **These are slated to be
upstreamed** — once that lands, delete this directory and import the equivalents from
`@aztec/*`.

> Pinned to the same Aztec version as the rest of the repo. If you bump the Aztec
> version (`npm run update`), re-sync these from the matching aztec-kit tag.
