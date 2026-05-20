import { getState, setState } from "@/lib/kv";
import { clearSettleLockForDate } from "@/lib/settle-lock";
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
