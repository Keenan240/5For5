import { getState, storageMode } from "@/lib/kv";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getTonightSlate } from "@/lib/tonight";

export async function GET() {
  const state = await getState();
  const slate = await getTonightSlate();

  const settleLock = state.pending
    ? await getSettleLockStatus(state.pending)
    : null;

  return Response.json({
    ...state,
    storage: storageMode(),
    qualifiedCount: null,
    sliderMax: 8,
    slate: {
      date: slate.date,
      games: slate.games,
      rosterCount: slate.players.length,
      source: slate.source,
      rosterSource: slate.rosterSource,
    },
    settleLock: settleLock
      ? {
          locked: settleLock.locked,
          lockReason: settleLock.lockReason,
          unlockAt: settleLock.unlockAt?.toISOString() ?? null,
          unlockLabel: settleLock.unlockLabel,
          remainingMs: settleLock.remainingMs,
          statsReady: settleLock.statsReady,
          allGamesFinal: settleLock.allGamesFinal,
          usingFallbackUnlock: settleLock.usingFallbackUnlock,
          isTodaysSlate: settleLock.isTodaysSlate,
          deferredAfterRevert: settleLock.deferredAfterRevert,
        }
      : null,
  });
}
