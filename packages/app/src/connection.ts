/**
 * Connection lifecycle for the network(s) the user picks.
 *
 * `useConnections(deployment)` owns it: a reducer keyed by network, a module-level
 * cache of in-flight connections (so switching networks back and forth reuses each
 * one), and the effect that opens or reuses a `VotingClient` for the active
 * deployment. The component reads the active network's `ConnState` and can `reset`
 * a network to retry it.
 *
 * The state is discriminated by `SetupPhase` itself: while connecting it *is* the
 * narrated phase (connect/account/register); the terminal phases carry their
 * payload (the client when "done", the message when "error"). So the UI reads the
 * phase straight off the state — no mapping.
 */
import { useCallback, useEffect, useReducer, type Dispatch } from "react";

import { VotingClient, type SetupPhase } from "./aztec/voting_client.ts";
import type { Deployment } from "./aztec/deployment.ts";

/** The phases reached while still connecting (everything before done/error). */
type ConnectingPhase = Exclude<SetupPhase, "done" | "error">;

export type ConnState =
  | { phase: ConnectingPhase }
  | { phase: "done"; client: VotingClient }
  | { phase: "error"; message: string };

export type ConnMap = Record<string, ConnState>;

type ConnAction =
  | { type: "phase"; network: string; phase: ConnectingPhase }
  | { type: "ready"; network: string; client: VotingClient }
  | { type: "failed"; network: string; message: string }
  | { type: "reset"; network: string };

function connReducer(state: ConnMap, action: ConnAction): ConnMap {
  switch (action.type) {
    case "phase":
      return { ...state, [action.network]: { phase: action.phase } };
    case "ready":
      return {
        ...state,
        [action.network]: { phase: "done", client: action.client },
      };
    case "failed":
      return {
        ...state,
        [action.network]: { phase: "error", message: action.message },
      };
    case "reset": {
      const { [action.network]: _removed, ...rest } = state;
      return rest;
    }
  }
}

// In-flight/established connections, cached at module scope so React StrictMode's
// double-mounted effect can't create two wallets, and switching networks back and
// forth reuses each one instead of reconnecting.
const connections = new Map<string, Promise<VotingClient>>();

// Open (or reuse) the connection for `deployment`, funnelling its lifecycle into
// `dispatch`. Returns a cleanup that detaches this caller, so a connect left stale
// by a network switch can't dispatch over the newly-selected one.
function openConnection(
  deployment: Deployment,
  dispatch: Dispatch<ConnAction>,
): () => void {
  const network = deployment.network;
  let cancelled = false;

  let pending = connections.get(network);
  if (!pending) {
    pending = VotingClient.connect(deployment, (phase) => {
      // "done"/"error" arrive as the ready/failed dispatches below.
      if (phase !== "done" && phase !== "error") {
        dispatch({ type: "phase", network, phase });
      }
    });
    connections.set(network, pending);
  }

  void (async () => {
    try {
      const client = await pending;
      if (!cancelled) dispatch({ type: "ready", network, client });
    } catch (err) {
      if (cancelled) return;
      connections.delete(network); // let a re-select retry from scratch
      dispatch({
        type: "failed",
        network,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return () => {
    cancelled = true;
  };
}

export function useConnections(deployment: Deployment | null) {
  const [conns, dispatch] = useReducer(connReducer, {});

  // Connect whenever the selected deployment changes; the returned cleanup
  // detaches the previous attempt.
  useEffect(() => {
    if (deployment) return openConnection(deployment, dispatch);
  }, [deployment]);

  const reset = useCallback((network: string) => {
    connections.delete(network);
    dispatch({ type: "reset", network });
  }, []);

  return { conns, reset };
}
