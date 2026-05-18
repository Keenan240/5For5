import { revertLastSettle } from "@/lib/revert-settle";
import { getSettleLockStatus } from "@/lib/settle-lock";

export async function POST() {
  try {
    const result = await revertLastSettle();
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, state: result.state },
        { status: 400 }
      );
    }

    const settleLock = result.state.pending
      ? await getSettleLockStatus(result.state.pending)
      : null;

    return Response.json({
      ok: true,
      message: result.message,
      state: result.state,
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
  } catch (err) {
    console.error("Revert settle error:", err);
    return Response.json(
      { ok: false, error: "Failed to revert settle." },
      { status: 500 }
    );
  }
}
