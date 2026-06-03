# Example App — Status & Integration Contract

This doc summarizes the **quickstart website** that's built, and specifies what the
**example app repo** (private voting, Linear F-687) must provide so the site can
consume it with zero code changes on the site side.

---

## 1. What's done (the website)

A custom **Vite + React + TypeScript**, statically-prerendered quickstart site
(`aztec-quickstart`). It frames onboarding as a videogame: a **main quest**
(install → clone → understand/build → test → deploy) plus **side quests**.

Built and verified:
- **Rendering**: React Router v7 (`ssr:false` prerender), MDX content, Shiki
  highlighting incl. a registered **Noir** grammar, vanilla-extract theming aligned
  to docs.aztec.network (dark default + cream light, lime accent, diamond glyph).
- **Quest UX**: branching timeline map (side quests sprout from their prereq step),
  per-step progress + Normal/Prompt content modes (persisted), right-sidebar TOC.
- **Versioning + i18n**: fully data-driven. Adding a version or locale is config +
  content only — no code. (Stress-tested with a v5 nightly + Spanish, then removed.)
- **Snippet supply chain**: `#include_code` inlines real app code at build time from
  a pinned commit; fail-closed verification; hermetic builds from vendored
  `.snippets/`. **Currently a fixture** (`.snippets/v4.3/contracts/src/main.nr`)
  stands in until the real app repo exists.

The only thing blocking real content is the example app. Everything below is what
unblocks it.

---

## 2. Integration contract — what the site needs from the app repo

### 2.1 The repo + refs
- A repo at a stable `owner/name`. The site currently pins the placeholder
  **`AztecProtocol/aztec-quickstart-app`** in `versions/manifest.json` → **confirm the
  real name/owner.**
- **Tags per supported Aztec version.** The site pins a version to a git ref
  (resolved to an immutable commit SHA). Today the `v4.3` site version expects
  app ref **`v4.3.0`** (a tag). Cut a tag for each Aztec version the tutorial targets.
- A **`next` branch** for the nightly/v5 track (when we add it).
- The site never auto-updates the app; we re-pin via `pnpm resolve:refs` +
  `pnpm sync:snippets` when you ship a new tag. A pinned SHA → shown code never drifts.

### 2.2 Directory layout (must match `snippetRoots`)
The sync step vendors only these paths, so the repo must put code under them:
```
contracts/            Noir contract(s) — e.g. contracts/src/main.nr
src/                  TypeScript frontend / aztec.js interaction code
scripts/              deploy + interaction scripts
Nargo.toml
package.json
```
(If the layout differs, it's a one-line edit to `snippetRoots` in the manifest — but
agreeing on the above now avoids churn.)

### 2.3 `docs:start` / `docs:end` markers — THE critical contract
The site inlines **named regions** from your source, not line ranges. Each region is
delimited by comment markers the site greps for:
```rust
// docs:start:cast_vote
#[private]
fn cast_vote(candidate: Field) { … }
// docs:end:cast_vote
```
Rules:
- **The build fails (fail-closed)** if a referenced region or file is missing — so
  marker names are a stability contract. If you refactor and rename/move a region,
  the site's `#include_code` reference must change in lockstep (or keep the marker).
- `*` can be used for whole-file includes, but named regions are preferred.

**Regions the current content already references** (in `contracts/src/main.nr`):

| region | what it should wrap |
| --- | --- |
| `storage_struct` | the contract's `#[storage]` struct (public tally + state) |
| `cast_vote` | the private `cast_vote` function that emits a nullifier |

This list grows as we author more content; we'll coordinate region names as we go.
(See `.snippets/v4.3/contracts/src/main.nr` for the exact shape the fixture mimics.)

### 2.4 Commands the tutorial teaches (the app should support these verbatim)
From the main-quest content today:
- Build: **`aztec compile`** then **`aztec codegen`** (or `yarn` wrappers).
- Test: **`yarn test`** (should cover TXE unit tests + an in-process integration test).
- Deploy: **`yarn deploy`** (local, prefunded account) and
  **`yarn deploy::testnet`** (honoring `NODE_URL=https://rpc.testnet.aztec-labs.com`).
- Clone flow: `git clone … && cd … && yarn install`.

So `package.json` should expose at least: `compile`, `codegen`, `test`, `deploy`,
`deploy::testnet` (names can be adjusted — but the content currently shows these).

### 2.5 Toolchain / runtime
- Target **Node 24** (the site's manifest pins `nodeVersion: "24"`).
- Pin `@aztec/*` deps + `Nargo.toml` to the Aztec version the tag targets (e.g.
  4.3.0). Stable tags → stable Aztec; `next` → nightly.
- **Fast install** matters (Linear F-688): the getting-started flow should not pull
  Aztec packages from source.

---

## 3. The app itself (private voting)

The tutorial's narrative assumes an **EasyPrivateVoting**-style app:
- **Public tally, private votes**: a `#[storage]` struct holding the public tally +
  admin/state; a `#[private] cast_vote` that emits a **nullifier** so nobody votes
  twice (this public/private mix is the whole pedagogical point).
- **Clear frontend ↔ contracts split** (the "clone the app" step tours this).
- Frontend interaction following the **`REGISTER → SIMULATE → SEND`** flow the site
  drills repeatedly (external-wallet side quest adds a leading `MANIFEST`).
- Test tiers: **TXE** contract unit tests, an **in-process integration** test
  (F-689), and ideally a **Playwright E2E** against a local network (F-692).
- Deployment: local with **prefunded accounts** (anvil/forge-familiar), then
  **testnet** — making explicit how deploying on Aztec differs from Ethereum (F-691),
  with the bridging/fee-juice + privacy-pitfall notes.

The site's fixture (`.snippets/v4.3/contracts/src/main.nr`) is a faithful stand-in;
the real contract should at minimum keep the `storage_struct` and `cast_vote` regions.

---

## 4. Open decisions to confirm
- **Repo name/owner** for the example app (replaces the `AztecProtocol/aztec-quickstart-app` placeholder).
- **App concept**: private voting (assumed by current content) vs. the secret-santa
  alternative once weighed. Content is written for private voting.
- **FPC placement**: fee-paying contract on testnet as a main-quest step vs. a side
  quest; whether to reuse/simplify the `aztec-kit` subscription FPC.
- **Exact fast-install command** (F-688) and final `aztec-up` pin syntax for copy.
- **Command names**: confirm `compile`/`codegen`/`test`/`deploy`/`deploy::testnet`
  (or tell us the real script names and we'll match the content).

---

## 5. Once the repo exists — wiring it up (site side, ~5 min)
1. Set `app.repo` in `versions/manifest.json` to the real `owner/name`; `refLabel` to
   the tag (e.g. `v4.3.0`).
2. `pnpm resolve:refs` → writes the immutable commit SHA into `app.ref`.
3. `pnpm sync:snippets` → vendors real code into `.snippets/v4.3/` (replaces the fixture).
4. `pnpm verify:snippets` → confirms every `#include_code` region resolves.
5. Commit (the `.snippets/` diff shows exactly what learners will see) and open a PR.
