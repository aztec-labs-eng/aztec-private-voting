# `lib/aztec-kit` — vendored helpers (temporary)

These files are **copied verbatim from [aztec-kit](https://github.com/AztecProtocol/aztec-kit)**
(`packages/common/src/{testing,bridging}`). They cover two things that aztec.js
doesn't yet give you out of the box, and that you really don't want to reinvent:

- **`testing/`** — spinning up an *in-process* local Aztec network for integration
  tests (`setupLocalNetwork`), wallet/payment setup, and idempotent admin-account
  deploys.
- **`bridging/`** — the L1→L2 fee-juice bridge flow (`bridge`), used to fund a deployer
  on testnet.

They are intentionally quarantined here so the example app's *own* code (the contract,
the deploy script, the frontend) stays small and readable. **These are slated to be
upstreamed into `aztec.js`** — once that lands, delete this directory and import the
equivalents from `@aztec/aztec.js`.

> Pinned to the same Aztec version as the rest of the repo. If you bump the Aztec
> version (`npm run update`), re-sync these from the matching aztec-kit tag.
