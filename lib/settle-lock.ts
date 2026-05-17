import type { PendingParlay } from "./types";
import { getTodayEastern } from "./tonight";

const ET = "America/New_York";
const UNLOCK_HOUR = 2;
const UNLOCK_MINUTE = 30;

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

/** 2:30 AM ET on the morning after the slate date (stats usually posted). */
export function getSettleUnlockAt(slateDateYmd: string): Date {
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

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "0:00:00";
  const totalSec = Math.ceil(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type SettleLockStatus = {
  locked: boolean;
  unlockAt: Date;
  unlockLabel: string;
  remainingMs: number;
  isTodaysSlate: boolean;
};

export function getSettleLockStatus(pending: PendingParlay): SettleLockStatus {
  const unlockAt = getSettleUnlockAt(pending.date);
  const now = Date.now();
  const remainingMs = Math.max(0, unlockAt.getTime() - now);
  const isTodaysSlate = pending.date === getTodayEastern();

  return {
    locked: remainingMs > 0,
    unlockAt,
    unlockLabel: formatUnlockTimeEt(unlockAt),
    remainingMs,
    isTodaysSlate,
  };
}

export function settleLockHint(pending: PendingParlay): string {
  const { locked, unlockLabel, isTodaysSlate } = getSettleLockStatus(pending);
  if (!locked) {
    return "Games from this slate should be final — settle when FanDuel stats match.";
  }
  if (isTodaysSlate) {
    return `Settle unlocks ${unlockLabel} (after tonight's games wrap and stats post).`;
  }
  return `Settle unlocks ${unlockLabel}.`;
}
