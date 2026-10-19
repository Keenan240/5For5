import { requireSessionUser } from "@/lib/auth-user";
import { runCancelPendingParlay } from "@/lib/cancel-pending-parlay";
import { removeCommunityFeedItem } from "@/lib/community-feed";

export async function POST(request: Request) {
  try {
    const gate = await requireSessionUser();
    if (!gate.ok) return gate.response;

    let date: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.date === "string") date = body.date;
    } catch {
      /* empty body ok */
    }

    const result = await runCancelPendingParlay(date, gate.user.id);

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

    if (gate.user.id !== "local" && result.cancelledDate) {
      void removeCommunityFeedItem(gate.user.id, result.cancelledDate).catch(
        (err) => console.error("community feed remove failed:", err)
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
