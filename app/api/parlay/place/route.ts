import { requireSessionUser } from "@/lib/auth-user";
import { publishCommunityPlacement } from "@/lib/community-feed";
import { isStakeTier } from "@/lib/odds";
import { runPlaceParlay } from "@/lib/place-parlay";
import { getUser } from "@/lib/users";
import type { ParlayLeg, RankedPoolPick } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const gate = await requireSessionUser();
    if (!gate.ok) return gate.response;

    const body = await request.json();
    const date = String(body.date ?? "");
    const legs = body.legs as ParlayLeg[] | undefined;
    const rankedPool = body.rankedPool as RankedPoolPick[] | undefined;
    const stakeRaw = Number(body.stake);
    const stake = isStakeTier(stakeRaw) ? stakeRaw : undefined;

    if (!date || !legs?.length) {
      return Response.json(
        { error: "Missing date or legs." },
        { status: 400 }
      );
    }

    const result = await runPlaceParlay({
      date,
      legs,
      rankedPool,
      stake,
      userId: gate.user.id,
    });

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

    const placed = result.state.pending.find((p) => p.date === date);
    if (placed && gate.user.id !== "local") {
      const profile = await getUser(gate.user.id);
      if (profile) {
        void publishCommunityPlacement(profile, placed).catch((err) =>
          console.error("community feed publish failed:", err)
        );
      }
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
