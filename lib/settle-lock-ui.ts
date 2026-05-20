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

export function settleLockHint(lock: SettleLockView): string {
  if (!lock.statsReady) {
    const waiting = lock.waitingPlayers?.length
      ? ` Waiting on: ${lock.waitingPlayers.join(", ")}.`
      : "";
    return `Settle anytime — feeds may still be updating.${waiting} Revert if results look wrong.`;
  }
  return "Settle when ready — revert if box scores look wrong.";
}

export function settleButtonLabel(_lock: SettleLockView): string {
  return "Settle";
}
