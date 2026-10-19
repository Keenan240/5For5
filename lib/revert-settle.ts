import { bankrollFromHistory } from "./history";
import { getState, setState } from "./kv";
import { calcPayout, roundMoney } from "./odds";
import { getNextMorningSettleUnlock } from "./settle-lock";
import { setSettleDeferredUntil } from "./settle-timing";
import type { ParlayState, PendingParlay, SettledParlay } from "./types";

function settledToPending(settled: SettledParlay): PendingParlay {
  const legs = settled.legs.map((leg) => {
    const { actualValue, hit, ...rest } = leg;
    void actualValue;
    void hit;
    return rest;
  });

  const rankedPool =
    settled.rankedPool?.length
      ? settled.rankedPool
      : settled.rankedResults?.map((row) => {
          const { actualValue, hit, ...rest } = row;
          void actualValue;
          void hit;
          return rest;
        });

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

  if (state.history.length === 0) {
    return { ok: false, state, error: "No settled parlay to revert." };
  }

  const last = state.history[state.history.length - 1];
  if (state.pending.some((p) => p.date === last.date)) {
    return {
      ok: false,
      state,
      error: "That night already has a pending slip.",
    };
  }

  const history = state.history.slice(0, -1);
  const pending = settledToPending(last);

  const next: ParlayState = {
    pending: [...state.pending, pending],
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
