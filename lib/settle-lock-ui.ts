export type SettleLockReason =
  | "unlocked"
  | "deferred"
  | "waiting_stats"
  | "waiting_games";

export type SettleLockView = {
  locked: boolean;
  lockReason: SettleLockReason;
  unlockLabel: string;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
  isTodaysSlate: boolean;
  deferredAfterRevert?: boolean;
  remainingMs?: number;
  waitingPlayers?: string[];
};

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "0:00:00";
  const totalSec = Math.ceil(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function settleLockHint(lock: SettleLockView): string {
  if (lock.deferredAfterRevert || lock.lockReason === "deferred") {
    return `Settle deferred until ${lock.unlockLabel} after revert — try again tomorrow morning.`;
  }
  if (!lock.locked) {
    return "Box scores are in — settle when FanDuel matches.";
  }
  if (lock.lockReason === "waiting_stats") {
    const waiting = lock.waitingPlayers?.length
      ? ` Still waiting on: ${lock.waitingPlayers.join(", ")}.`
      : "";
    return `Games are done — waiting for box scores in NBA/ESPN feeds (±1 day date match).${waiting}`;
  }
  return `Waiting for all games to finish — fallback unlock ${lock.unlockLabel}.`;
}

export function settleButtonLabel(lock: SettleLockView): string {
  if (!lock.locked) return "Settle";
  if (lock.lockReason === "waiting_stats") return "Waiting for stats…";
  if (
    (lock.lockReason === "deferred" || lock.lockReason === "waiting_games") &&
    lock.remainingMs != null &&
    lock.remainingMs > 0
  ) {
    return formatCountdown(lock.remainingMs);
  }
  return "Settle locked";
}
