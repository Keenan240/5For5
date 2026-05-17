import { getState, setState } from "@/lib/kv";
import { getSettleLockStatus } from "@/lib/settle-lock";
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

    const lock = getSettleLockStatus(state.pending);
    if (lock.locked) {
      return Response.json(
        {
          error: `Too early to settle. Unlocks ${lock.unlockLabel}.`,
          state,
          unlockAt: lock.unlockAt.toISOString(),
        },
        { status: 400 }
      );
    }

    const { state: newState, summary } = await settlePending(state);
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
