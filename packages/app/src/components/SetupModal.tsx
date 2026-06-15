import { StepProgress, type Step, type StepState } from "./StepProgress.tsx";
import type { SetupPhase } from "../aztec/setup.ts";
import * as css from "./SetupModal.css.ts";

// What the modal teaches: every step the app takes before you can vote.
const SETUP_STEPS: { key: SetupPhase; label: string; description: string }[] = [
  { key: "connect", label: "Connect to the network", description: "Open an in-browser wallet" },
  { key: "account", label: "Create your account", description: "An initializerless account — no on-chain deploy needed" },
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

export interface NetworkChoice {
  key: string;
  network: string;
  nodeUrl: string;
}

export function SetupModal({
  networks,
  selectedKey,
  phase,
  error,
  onSelect,
  onBack,
  onEnter,
}: {
  networks: NetworkChoice[];
  selectedKey: string | null;
  phase: SetupPhase;
  error: string | null;
  onSelect: (key: string) => void;
  onBack: () => void;
  onEnter: () => void;
}) {
  // ── Network chooser: shown when nothing is selected yet (multiple deployments). ──
  if (!selectedKey) {
    return (
      <div className={css.backdrop} role="dialog" aria-modal="true">
        <div className={css.dialog}>
          <div>
            <h2 className={css.title}>Choose a network</h2>
            <p className={css.subtitle}>
              This app is deployed to more than one network. Pick which one to connect to.
            </p>
          </div>
          <div className={css.choices}>
            {networks.map((n) => (
              <button key={n.key} className={css.choice} onClick={() => onSelect(n.key)}>
                <span className={css.choiceName}>{n.network}</span>
                <span className={css.choiceUrl}>{n.nodeUrl}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Connection steps for the selected network. ──
  const done = phase === "done";
  const steps: Step[] = SETUP_STEPS.map((s) => ({ ...s, state: stateFor(s.key, phase, !!error) }));

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
        {error && networks.length > 1 && (
          <button className={css.secondary} onClick={onBack}>
            ← Choose another network
          </button>
        )}
      </div>
    </div>
  );
}
