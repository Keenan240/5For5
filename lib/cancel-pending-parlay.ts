import { getState, setState } from "./kv";
import { roundMoney } from "./odds";
import { normalizePendingList } from "./pending";
import { clearSettleLockForDate } from "./settle-lock";
import type { ParlayState } from "./types";

export type CancelPendingParlayResult = {
  ok: boolean;
  message: string;
  state: ParlayState;
  error?: string;
};

export async function runCancelPendingParlay(
  date?: string,
  userId?: string | null
): Promise<CancelPendingParlayResult> {
  const state = await getState(userId);
  const list = normalizePendingList(state.pending);

  if (list.length === 0) {
    return {
      ok: false,
      message: "No pending parlay to cancel.",
      state,
      error: "no_pending",
    };
  }

  const pending = date
    ? list.find((p) => p.date === date)
    : list[0];
  if (!pending) {
    return {
      ok: false,
      message: "No pending parlay for that date.",
      state,
      error: "no_pending",
    };
  }

  const newState: ParlayState = {
    ...state,
    bankroll: roundMoney(state.bankroll + pending.stake),
    pending: list.filter((p) => p.date !== pending.date),
  };

  await clearSettleLockForDate(pending.date);
  await setState(newState, userId);

  return {
    ok: true,
    message: `Pending parlay cancelled for ${pending.date}.`,
    state: newState,
  };
}
