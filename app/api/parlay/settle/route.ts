import { getState, setState } from "@/lib/kv";
import { getSettleLockStatus, clearSettleLockForDate } from "@/lib/settle-lock";
import { settlePending } from "@/lib/settle";

export async function POST(request: Request) {
  try {
    const state = await getState();
    let date: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.date === "string") date = body.date;
    } catch {
      /* empty body ok */
    }

    if (state.pending.length === 0) {
      return Response.json({
        message: "No pending parlay to settle.",
        state,
      });
    }

    const target = date
      ? state.pending.find((p) => p.date === date)
      : state.pending[0];
    if (!target) {
      return Response.json({
        message: "No pending parlay for that date.",
        state,
      });
    }

    const lock = await getSettleLockStatus(target);
    if (lock.locked) {
      return Response.json(
        {
          error:
            lock.lockReason === "waiting_stats"
              ? "Box scores aren't in yet — settle stays locked until results post."
              : lock.lockReason === "deferred"
                ? `Settle deferred until ${lock.unlockLabel}.`
                : `Games aren't final yet — settle unlocks ${lock.unlockLabel}.`,
          settleLock: {
            locked: lock.locked,
            lockReason: lock.lockReason,
            unlockAt: lock.unlockAt?.toISOString() ?? null,
            unlockLabel: lock.unlockLabel,
            remainingMs: lock.remainingMs,
            statsReady: lock.statsReady,
            allGamesFinal: lock.allGamesFinal,
            usingFallbackUnlock: lock.usingFallbackUnlock,
            isTodaysSlate: lock.isTodaysSlate,
            deferredAfterRevert: lock.deferredAfterRevert,
            legsStats: lock.legsStats,
          },
          state,
        },
        { status: 400 }
      );
    }

    const { state: newState, summary } = await settlePending(state, target.date);
    await clearSettleLockForDate(target.date);
    await setState(newState);

    return Response.json({
      message: summary,
      state: newState,
    });
  } catch (err) {
    console.error("Settle error:", err);
    return Response.json(
      { error: "Failed to settle parlay. Check server logs." },
      { status: 500 }
    );
  }
}
