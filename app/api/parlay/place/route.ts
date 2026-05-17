import { runPlaceParlay } from "@/lib/place-parlay";
import type { ParlayLeg } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const date = String(body.date ?? "");
    const legs = body.legs as ParlayLeg[] | undefined;

    if (!date || !legs?.length) {
      return Response.json(
        { error: "Missing date or legs." },
        { status: 400 }
      );
    }

    const result = await runPlaceParlay({ date, legs });

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          message: result.message,
          state: result.state,
        },
        { status: 400 }
      );
    }

    return Response.json({
      message: result.message,
      state: result.state,
      ok: true,
    });
  } catch (err) {
    console.error("Place parlay error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to place parlay. Check server logs.";
    return Response.json({ error: message }, { status: 500 });
  }
}
