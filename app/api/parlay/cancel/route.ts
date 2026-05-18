import { runCancelPendingParlay } from "@/lib/cancel-pending-parlay";

export async function POST() {
  try {
    const result = await runCancelPendingParlay();

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
          message: result.message,
          state: result.state,
        },
        { status: 400 }
      );
    }

    return Response.json({
      ok: true,
      message: result.message,
      state: result.state,
    });
  } catch (err) {
    console.error("Cancel parlay error:", err);
    return Response.json(
      { ok: false, error: "Failed to cancel parlay. Check server logs." },
      { status: 500 }
    );
  }
}
