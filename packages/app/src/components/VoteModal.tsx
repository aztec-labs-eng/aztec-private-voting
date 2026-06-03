import * as css from "./VoteModal.css.ts";

// What `cast_vote(...).send()` does under the hood. We can't track these phases
// without overriding the wallet, so the modal explains them rather than tracking
// them — it blurs the page while the single send() call runs.
const STEPS = [
  {
    name: "Simulating",
    desc: "Running cast_vote locally to work out its effects and gas — no fee, nothing on-chain yet.",
  },
  {
    name: "Proving",
    desc: "Generating a zero-knowledge proof of the vote in your browser. This is the slow part.",
  },
  {
    name: "Sending",
    desc: "Submitting the proof to the network. Only a nullifier and the public tally change.",
  },
];

export function VoteModal({ candidateName }: { candidateName: string }) {
  return (
    <div className={css.backdrop} role="dialog" aria-modal="true">
      <div className={css.dialog}>
        <div className={css.spinner} />
        <div>
          <h2 className={css.title}>Casting your vote for {candidateName}</h2>
          <p className={css.subtitle}>
            Your vote stays private. Here's what `cast_vote` is doing right now:
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
      </div>
    </div>
  );
}
