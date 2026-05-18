import { getState, setState } from "./kv";
import { roundMoney } from "./odds";
import { clearSettleLockForDate } from "./settle-lock";
import type { ParlayState } from "./types";

export type CancelPendingParlayResult = {
  ok: boolean;
  message: string;
  state: ParlayState;
  error?: string;
};

export async function runCancelPendingParlay(): Promise<CancelPendingParlayResult> {
  const state = await getState();

  if (!state.pending) {
    return {
      ok: false,
      message: "No pending parlay to cancel.",
      state,
      error: "no_pending",
    };
  }

  const pending = state.pending;
  const newState: ParlayState = {
    ...state,
    bankroll: roundMoney(state.bankroll + pending.stake),
    pending: null,
  };

  await clearSettleLockForDate(pending.date);
  await setState(newState);

  return {
    ok: true,
    message: `Pending parlay cancelled. Stake $${pending.stake} returned. Bankroll $${newState.bankroll.toFixed(2)}.`,
    state: newState,
  };
}
