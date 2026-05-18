export type SettleLockView = {
  locked: boolean;
  unlockLabel: string;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
  isTodaysSlate: boolean;
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
  if (!lock.statsReady) {
    return "Waiting for tonight's box scores in the stat feed — won't settle on yesterday's games.";
  }
  if (!lock.locked) {
    return "Games from this slate should be final — settle when FanDuel stats match.";
  }
  if (lock.allGamesFinal && !lock.usingFallbackUnlock) {
    return `All games final — settle unlocks ${lock.unlockLabel} (60 min buffer for stats).`;
  }
  if (lock.isTodaysSlate) {
    return `Settle unlocks ${lock.unlockLabel} (after tonight's games wrap and stats post).`;
  }
  return `Settle unlocks ${lock.unlockLabel}.`;
}
