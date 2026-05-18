export type SettleLockView = {
  locked: boolean;
  unlockLabel: string;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
  isTodaysSlate: boolean;
  deferredAfterRevert?: boolean;
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
  if (lock.deferredAfterRevert) {
    return `Settle deferred until ${lock.unlockLabel} after revert — try again tomorrow morning.`;
  }
  if (!lock.statsReady) {
    return "Waiting for tonight's box scores in the stat feed — won't settle on yesterday's games.";
  }
  if (!lock.locked) {
    return "All games final with stats in — settle when FanDuel matches.";
  }
  if (!lock.allGamesFinal) {
    return `Waiting for all games to finish — fallback unlock ${lock.unlockLabel}.`;
  }
  if (lock.isTodaysSlate) {
    return "Games are final — settle unlocks once box scores are in.";
  }
  return `Settle unlocks ${lock.unlockLabel}.`;
}
