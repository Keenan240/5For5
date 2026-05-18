import { bankrollFromHistory } from "./history";
import { getState, setState } from "./kv";
import { calcPayout, roundMoney } from "./odds";
import { getNextMorningSettleUnlock } from "./settle-lock";
import { setSettleDeferredUntil } from "./settle-timing";
import type { ParlayState, PendingParlay, SettledParlay } from "./types";

function settledToPending(settled: SettledParlay): PendingParlay {
  const legs = settled.legs.map(
    ({ actualValue: _v, hit: _h, ...rest }) => rest
  );

  const rankedPool = settled.rankedResults?.map(
    ({ actualValue: _v, hit: _h, ...rest }) => rest
  );

  return {
    date: settled.date,
    stake: settled.stake,
    legs,
    parlayOdds: settled.parlayOdds,
    potentialPayout: roundMoney(calcPayout(settled.stake, settled.parlayOdds)),
    confidence: "MEDIUM",
    rankedPool,
  };
}

export async function revertLastSettle(): Promise<{
  ok: boolean;
  state: ParlayState;
  error?: string;
  message?: string;
}> {
  const state = await getState();

  if (state.pending) {
    return {
      ok: false,
      state,
      error: "You already have a pending parlay. Settle or remove it first.",
    };
  }

  if (state.history.length === 0) {
    return { ok: false, state, error: "No settled parlay to revert." };
  }

  const last = state.history[state.history.length - 1];
  const history = state.history.slice(0, -1);
  const pending = settledToPending(last);

  const next: ParlayState = {
    pending,
    history,
    bankroll: 0,
  };
  next.bankroll = bankrollFromHistory(next);

  const deferredUntil = getNextMorningSettleUnlock(pending.date);
  await setSettleDeferredUntil(pending.date, deferredUntil);
  await setState(next);

  return {
    ok: true,
    state: next,
    message: `Reverted last settle. Parlay is pending again — settle unlocks ${deferredUntil.toLocaleString("en-US", { timeZone: "America/New_York" })} ET.`,
  };
}
