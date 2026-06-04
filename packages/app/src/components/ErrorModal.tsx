import * as css from "./ErrorModal.css.ts";

/** Blocking modal shown when a transaction fails, instead of a easy-to-miss footnote. */
export function ErrorModal({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className={css.backdrop} role="alertdialog" aria-modal="true">
      <div className={css.dialog}>
        <span className={css.icon}>⚠</span>
        <div>
          <h2 className={css.title}>Transaction failed</h2>
        </div>
        <p className={css.message}>{message}</p>
        <button className={css.button} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
