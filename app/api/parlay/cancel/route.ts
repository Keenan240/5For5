import { runCancelPendingParlay } from "@/lib/cancel-pending-parlay";

export async function POST(request: Request) {
  try {
    let date: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.date === "string") date = body.date;
    } catch {
      /* empty body ok */
    }

    const result = await runCancelPendingParlay(date);

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
