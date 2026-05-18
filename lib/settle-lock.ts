import type { PendingParlay } from "./types";
import { getSlateForDate, getTodayEastern } from "./tonight";
import { getAllFinalAt, markAllFinalAt } from "./settle-timing";
import { hasGameOnSlateDate, loadPlayerIdMap } from "./stats";

const ET = "America/New_York";
const UNLOCK_HOUR = 2;
const UNLOCK_MINUTE = 30;
const ALL_FINAL_BUFFER_MS = 60 * 60 * 1000;

function addDaysYmd(ymd: string, days: number): string {
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
  unlockAt: Date;
  unlockLabel: string;
  remainingMs: number;
  isTodaysSlate: boolean;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
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

  const slate = await getSlateForDate(pending.date);
  const allGamesFinal =
    slate.games.length > 0 &&
    slate.games.every((g) => isGameFinal(g.status));

  let unlockAt = fallbackUnlock;
  let usingFallbackUnlock = true;

  if (allGamesFinal) {
    await markAllFinalAt(pending.date, new Date());
    const allFinalAt = await getAllFinalAt(pending.date);
    if (allFinalAt) {
      const bufferUnlock = new Date(
        allFinalAt.getTime() + ALL_FINAL_BUFFER_MS
      );
      unlockAt = bufferUnlock;
      usingFallbackUnlock = false;
    }
  }

  const statsReady = await checkStatsReady(pending);
  const timeRemainingMs = Math.max(0, unlockAt.getTime() - now);
  const locked = timeRemainingMs > 0 || !statsReady;

  return {
    locked,
    unlockAt,
    unlockLabel: formatUnlockTimeEt(unlockAt),
    remainingMs: timeRemainingMs,
    isTodaysSlate,
    statsReady,
    allGamesFinal,
    usingFallbackUnlock,
  };
}
