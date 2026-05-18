import { getState, setState } from "@/lib/kv";
import { clearSettleLockForDate, getSettleLockStatus } from "@/lib/settle-lock";
import { settlePending } from "@/lib/settle";

export async function POST() {
  try {
    const state = await getState();

    if (!state.pending) {
      return Response.json({
        message: "No pending parlay to settle.",
        state,
      });
    }

    const lock = await getSettleLockStatus(state.pending);
    if (lock.locked) {
      const error =
        lock.lockReason === "waiting_stats"
          ? "Tonight's box scores aren't in the stat feed yet — won't settle on yesterday's games."
          : lock.lockReason === "deferred"
            ? `Settle deferred until ${lock.unlockLabel} after revert.`
            : `Too early to settle. Unlocks ${lock.unlockLabel}.`;
      return Response.json(
        {
          error,
          state,
          unlockAt: lock.unlockAt?.toISOString() ?? null,
        },
        { status: 400 }
      );
    }

    const { state: newState, summary } = await settlePending(state);
    await clearSettleLockForDate(state.pending.date);
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
