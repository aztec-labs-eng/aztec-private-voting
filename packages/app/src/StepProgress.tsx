import * as css from "./StepProgress.css.ts";

export type StepState = "pending" | "active" | "done" | "error";

export interface Step {
  key: string;
  label: string;
  description: string;
  state: StepState;
}

const GLYPH: Record<StepState, string> = {
  pending: "",
  active: "...",
  done: "✓",
  error: "!",
};

/**
 * Always-visible panel that walks the user through CONNECT -> REGISTER ->
 * SIMULATE -> SEND, so every protocol step is visible as it happens.
 */
export function StepProgress({ steps }: { steps: Step[] }) {
  return (
    <div className={css.panel}>
      {steps.map((step, i) => (
        <div className={css.row} key={step.key}>
          <span className={`${css.dot} ${css.dotState[step.state]}`}>
            {step.state === "done" || step.state === "error" || step.state === "active"
              ? GLYPH[step.state]
              : i + 1}
          </span>
          <span className={css.labels}>
            <span className={`${css.label} ${css.labelState[step.state]}`}>{step.label}</span>
            <span className={css.desc}>{step.description}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
