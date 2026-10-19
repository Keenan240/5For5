import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth-user";
import { removeCommunityFeedItem } from "@/lib/community-feed";
import { deleteHistoryEntry } from "@/lib/history";
import { syncLeaderboardForUser } from "@/lib/leaderboard";
import { getUser } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const gate = await requireSessionUser();
    if (!gate.ok) return gate.response;

    const body = await request.json();
    const index = Number(body?.index);
    if (!Number.isInteger(index)) {
      return NextResponse.json(
        { ok: false, error: "index must be an integer" },
        { status: 400 }
      );
    }

    const result = await deleteHistoryEntry(index, gate.user.id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    if (gate.user.id !== "local") {
      const profile = await getUser(gate.user.id);
      if (profile) {
        void syncLeaderboardForUser(profile, result.state).catch(() => {});
      }
      if (result.deletedDate) {
        void removeCommunityFeedItem(gate.user.id, result.deletedDate).catch(
          () => {}
        );
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
