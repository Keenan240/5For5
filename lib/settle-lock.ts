import type { PendingParlay } from "./types";
import { getSlateForDate, getTodayEastern } from "./tonight";
import {
  clearSettleDeferredUntil,
  getSettleDeferredUntil,
} from "./settle-timing";
import { hasGameOnSlateDate, loadPlayerIdMap } from "./stats";

const ET = "America/New_York";
const UNLOCK_HOUR = 2;
const UNLOCK_MINUTE = 30;

export type SettleLockReason =
  | "unlocked"
  | "deferred"
  | "waiting_stats"
  | "waiting_games";

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

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

/** 2:30 AM ET on the morning after the slate date (fallback if games linger). */
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

export function isGameFinal(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (!s) return false;
  return /\bfinal\b/.test(s);
}

export function formatUnlockTimeEt(unlockAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(unlockAt);
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
};

async function checkStatsReady(pending: PendingParlay): Promise<boolean> {
  const idMap = await loadPlayerIdMap();
  const checks = await Promise.all(
    pending.legs.map((leg) =>
      hasGameOnSlateDate(leg.player, pending.date, idMap)
    )
  );
  return checks.every(Boolean);
}

export async function getSettleLockStatus(
  pending: PendingParlay
): Promise<SettleLockStatus> {
  const now = Date.now();
  const fallbackUnlock = getFallbackSettleUnlockAt(pending.date);
  const isTodaysSlate = pending.date === getTodayEastern();

  const deferredUntil = await getSettleDeferredUntil(pending.date);
  if (deferredUntil && now < deferredUntil.getTime()) {
    const statsReady = await checkStatsReady(pending);
    const remainingMs = deferredUntil.getTime() - now;
    return {
      locked: true,
      lockReason: "deferred",
      unlockAt: deferredUntil,
      unlockLabel: formatUnlockTimeEt(deferredUntil),
      remainingMs,
      isTodaysSlate,
      statsReady,
      allGamesFinal: false,
      usingFallbackUnlock: true,
      deferredAfterRevert: true,
    };
  }

  const statsReady = await checkStatsReady(pending);

  if (statsReady) {
    return {
      locked: false,
      lockReason: "unlocked",
      unlockAt: null,
      unlockLabel: "",
      remainingMs: 0,
      isTodaysSlate,
      statsReady: true,
      allGamesFinal: true,
      usingFallbackUnlock: false,
      deferredAfterRevert: false,
    };
  }

  const slate = await getSlateForDate(pending.date);
  const allGamesFinal =
    slate.games.length === 0 ||
    slate.games.every((g) => isGameFinal(g.status));
  const pastFallback = now >= fallbackUnlock.getTime();

  if (allGamesFinal || pastFallback) {
    return {
      locked: true,
      lockReason: "waiting_stats",
      unlockAt: null,
      unlockLabel: "when box scores post",
      remainingMs: 0,
      isTodaysSlate,
      statsReady: false,
      allGamesFinal,
      usingFallbackUnlock: false,
      deferredAfterRevert: false,
    };
  }

  const remainingMs = Math.max(0, fallbackUnlock.getTime() - now);
  return {
    locked: true,
    lockReason: "waiting_games",
    unlockAt: fallbackUnlock,
    unlockLabel: formatUnlockTimeEt(fallbackUnlock),
    remainingMs,
    isTodaysSlate,
    statsReady: false,
    allGamesFinal: false,
    usingFallbackUnlock: true,
    deferredAfterRevert: false,
  };
}

/** Next 2:30 AM ET unlock at or after now (used after revert). */
export function getNextMorningSettleUnlock(slateDateYmd: string): Date {
  for (let extra = 0; extra < 5; extra++) {
    const unlock = getFallbackSettleUnlockAt(addDaysYmd(slateDateYmd, extra));
    if (unlock.getTime() > Date.now()) return unlock;
  }
  return getFallbackSettleUnlockAt(addDaysYmd(slateDateYmd, 4));
}

export async function clearSettleLockForDate(slateDate: string): Promise<void> {
  await clearSettleDeferredUntil(slateDate);
}
