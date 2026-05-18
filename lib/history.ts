import { buildRankedResultsForParlay } from "./history-ranked";
import { getState, setState } from "./kv";
import { roundMoney } from "./odds";
import type { ParlayState } from "./types";

export function bankrollFromHistory(state: ParlayState): number {
  let bankroll = 200;
  for (const entry of state.history) {
    bankroll = roundMoney(bankroll + entry.profit);
  }
  if (state.pending) {
    bankroll = roundMoney(bankroll - state.pending.stake);
  }
  return bankroll;
}

export async function deleteHistoryEntry(
  index: number
): Promise<{ ok: boolean; state: ParlayState; error?: string }> {
  const state = await getState();

  if (index < 0 || index >= state.history.length) {
    return { ok: false, state, error: "Invalid history index." };
  }

  const history = state.history.filter((_, i) => i !== index);
  const next: ParlayState = { ...state, history };
  next.bankroll = bankrollFromHistory(next);

  await setState(next);
  return { ok: true, state: next };
}

export async function backfillHistoryRanked(
  index: number
): Promise<{ ok: boolean; state: ParlayState; error?: string }> {
  const state = await getState();

  if (index < 0 || index >= state.history.length) {
    return { ok: false, state, error: "Invalid history index." };
  }

  const entry = state.history[index];
  if (entry.rankedResults?.length) {
    return { ok: true, state };
  }

  try {
    const rankedResults = await buildRankedResultsForParlay(entry);
    const history = state.history.map((h, i) =>
      i === index ? { ...h, rankedResults } : h
    );
    const next: ParlayState = { ...state, history };
    await setState(next);
    return { ok: true, state: next };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load ranked results.";
    return { ok: false, state, error: message };
  }
}
