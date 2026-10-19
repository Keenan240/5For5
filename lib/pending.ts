import { getEspnAthleteId } from "./espn";
import type { ParlayState, PendingParlay } from "./types";

/** Migrate legacy single pending → array. */
export function normalizePendingList(
  pending: PendingParlay | PendingParlay[] | null | undefined
): PendingParlay[] {
  if (Array.isArray(pending)) return pending;
  if (pending && typeof pending === "object") return [pending];
  return [];
}

export function normalizeParlayState(state: ParlayState): ParlayState {
  return {
    ...state,
    pending: normalizePendingList(
      state.pending as PendingParlay | PendingParlay[] | null
    ),
  };
}

/** Fill missing headshot IDs on pending legs (older slips / incomplete place payloads). */
export async function enrichPendingEspnIds(
  state: ParlayState
): Promise<{ state: ParlayState; changed: boolean }> {
  const pending = normalizePendingList(state.pending);
  let changed = false;
  const nextPending: PendingParlay[] = [];

  for (const slip of pending) {
    const legs = [];
    for (const leg of slip.legs) {
      if (leg.espnAthleteId?.trim()) {
        legs.push(leg);
        continue;
      }
      const id = await getEspnAthleteId(leg.player);
      if (id) {
        changed = true;
        legs.push({ ...leg, espnAthleteId: id });
      } else {
        legs.push(leg);
      }
    }
    nextPending.push({ ...slip, legs });
  }

  if (!changed) return { state, changed: false };
  return { state: { ...state, pending: nextPending }, changed: true };
}

export function hasSlipForDate(state: ParlayState, date: string): boolean {
  const pending = normalizePendingList(state.pending);
  if (pending.some((p) => p.date === date)) return true;
  return state.history.some((h) => h.date === date);
}

export function pendingForDate(
  state: ParlayState,
  date: string
): PendingParlay | null {
  return normalizePendingList(state.pending).find((p) => p.date === date) ?? null;
}
