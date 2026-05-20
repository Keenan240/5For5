import type { PendingParlay } from "./types";
import { addDaysYmd } from "./dates";
import { getSlateForDate, getTodayEastern } from "./tonight";
import { clearSettleDeferredUntil } from "./settle-timing";
import {
  checkAllLegsStatsReady,
  loadPlayerIdMap,
  type SlateGameResolution,
} from "./stats";

export type SettleLockReason =
  | "unlocked"
  | "deferred"
  | "waiting_stats"
  | "waiting_games";

export { addDaysYmd };

export function isGameFinal(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (!s) return false;
  return /\bfinal\b/.test(s);
}

export type SettleLockStatus = {
  locked: boolean;
  lockReason: SettleLockReason;
  unlockAt: Date | null;
  unlockLabel: string;
  remainingMs: number;
  isTodaysSlate: boolean;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
  deferredAfterRevert: boolean;
  legsStats: SlateGameResolution[];
};

/** Leg stat preview for pending UI — settle is always allowed; use revert if wrong. */
export async function getSettleLockStatus(
  pending: PendingParlay
): Promise<SettleLockStatus> {
  const isTodaysSlate = pending.date === getTodayEastern();
  const legsForCheck = pending.legs.map((leg) => ({
    player: leg.player,
    stat: leg.stat,
    threshold: leg.threshold,
  }));
  const idMap = await loadPlayerIdMap();

  const [{ ready: statsReady }, { legs: legsStats }, slate] = await Promise.all([
    checkAllLegsStatsReady(legsForCheck, pending.date, idMap, {
      allowAdjacentDay: true,
      allowPriorDay: false,
    }),
    checkAllLegsStatsReady(legsForCheck, pending.date, idMap, {
      allowAdjacentDay: false,
    }),
    getSlateForDate(pending.date, { fresh: isTodaysSlate }),
  ]);

  const allGamesFinal =
    slate.games.length === 0 ||
    slate.games.every((g) => isGameFinal(g.status));

  return {
    locked: false,
    lockReason: "unlocked",
    unlockAt: null,
    unlockLabel: "",
    remainingMs: 0,
    isTodaysSlate,
    statsReady,
    allGamesFinal,
    usingFallbackUnlock: false,
    deferredAfterRevert: false,
    legsStats,
  };
}

export async function clearSettleLockForDate(slateDate: string): Promise<void> {
  await clearSettleDeferredUntil(slateDate);
}

const ET = "America/New_York";
const UNLOCK_HOUR = 2;
const UNLOCK_MINUTE = 30;

function getPartsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Used after revert-settle messaging only (settle is not time-gated). */
export function getFallbackSettleUnlockAt(slateDateYmd: string): Date {
  const unlockYmd = addDaysYmd(slateDateYmd, 1);
  const [ty, tm, td] = unlockYmd.split("-").map(Number);
  const targetKey =
    ty * 1e8 + tm * 1e6 + td * 1e4 + UNLOCK_HOUR * 100 + UNLOCK_MINUTE;
  let lo = Date.UTC(ty, tm - 1, td, 0, 0, 0);
  let hi = Date.UTC(ty, tm - 1, td + 1, 0, 0, 0);
  while (hi - lo > 30_000) {
    const mid = Math.floor((lo + hi) / 2);
    const p = getPartsInZone(new Date(mid), ET);
    const key = p.year * 1e8 + p.month * 1e6 + p.day * 1e4 + p.hour * 100 + p.minute;
    if (key < targetKey) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export function getNextMorningSettleUnlock(slateDateYmd: string): Date {
  for (let extra = 0; extra < 5; extra++) {
    const unlock = getFallbackSettleUnlockAt(addDaysYmd(slateDateYmd, extra));
    if (unlock.getTime() > Date.now()) return unlock;
  }
  return getFallbackSettleUnlockAt(addDaysYmd(slateDateYmd, 4));
}
