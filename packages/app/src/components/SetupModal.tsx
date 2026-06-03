import { StepProgress, type Step, type StepState } from "./StepProgress.tsx";
import type { SetupPhase } from "../aztec/setup.ts";
import * as css from "./SetupModal.css.ts";

// What the modal teaches: every step the app takes before you can vote.
const SETUP_STEPS: { key: SetupPhase; label: string; description: string }[] = [
  { key: "connect", label: "Connect to the network", description: "Open an in-browser wallet (its own PXE)" },
  { key: "account", label: "Create your account", description: "A fresh private account, deployed with fees sponsored" },
  { key: "register", label: "Register the contract", description: "Teach your PXE about the deployed voting contract" },
];

const PHASE_ORDER: SetupPhase[] = ["connect", "account", "register", "done"];

function stateFor(stepKey: SetupPhase, phase: SetupPhase, error: boolean): StepState {
  if (error && stepKey === phase) return "error";
  const here = PHASE_ORDER.indexOf(phase);
  const mine = PHASE_ORDER.indexOf(stepKey);
  if (mine < here) return "done";
  if (mine === here) return "active";
  return "pending";
}

export function SetupModal({
  phase,
  error,
  onEnter,
}: {
  phase: SetupPhase;
  error: string | null;
  onEnter: () => void;
}) {
  const done = phase === "done";
  const steps: Step[] = SETUP_STEPS.map((s) => ({
    ...s,
    state: stateFor(s.key, phase, !!error),
  }));

  return (
    <div className={css.backdrop} role="dialog" aria-modal="true">
      <div className={css.dialog}>
        <div>
          <h2 className={css.title}>{done ? "You're ready to vote" : "Setting things up"}</h2>
          <p className={css.subtitle}>
            On Aztec, your app runs its own wallet + PXE in the browser. Here's everything it does
            before the first vote.
          </p>
        </div>

        <StepProgress steps={steps} />

        {error && <div className={css.errorBox}>{error}</div>}

        {done && (
          <button className={css.button} onClick={onEnter}>
            Enter the booth
          </button>
        )}
      </div>
    </div>
  );
}
