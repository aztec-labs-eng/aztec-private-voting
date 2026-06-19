import * as css from "./VoteModal.css.ts";

// Funding is a different process from voting: it touches L1 (an Ethereum wallet) and waits
// for the cross-chain message to arrive, which takes minutes. It only happens once per
// account on testnet — after this, casting a vote is the regular private flow.
const STEPS = [
  {
    name: "Connect L1 wallet",
    desc: "Authorize an Ethereum (Sepolia) wallet to send the bridge transactions.",
  },
  {
    name: "Bridge on L1",
    desc: "Lock Fee Juice on L1 so the voting contract can claim it on Aztec.",
  },
  {
    name: "Wait for Aztec",
    desc: "Wait for the L1→L2 message to arrive — this can take a few minutes.",
  },
];

export function BridgeModal({ status }: { status: string | null }) {
  return (
    <div className={css.backdrop} role="dialog" aria-modal="true">
      <div className={css.dialog}>
        <div className={css.spinner} />
        <div>
          <h2 className={css.title}>Funding your account</h2>
          <p className={css.subtitle}>
            A one-time step on this network: bridging Fee Juice from L1 so the contract can
            cover your fees. This is separate from voting — once funded, casting a vote is
            the regular private flow.
          </p>
        </div>
        <ul className={css.steps}>
          {STEPS.map((s) => (
            <li className={css.step} key={s.name}>
              <span className={css.stepName}>{s.name}</span>
              <span className={css.stepDesc}>{s.desc}</span>
            </li>
          ))}
        </ul>
        {status && (
          <p className={css.subtitle} aria-live="polite">
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
