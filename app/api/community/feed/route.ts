import {
  getCommunityFeed,
  listCommunityWeeks,
} from "@/lib/community-feed";
import { weekStartSunday } from "@/lib/week-record";
import { getTodayEastern } from "@/lib/dates";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope =
    url.searchParams.get("scope") === "lifetime" ? "lifetime" : "week";
  const weekParam = url.searchParams.get("week");
  const weekStart =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekStartSunday(weekParam)
      : weekStartSunday(getTodayEastern());
  const limitRaw = Number(url.searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
    : 40;

  try {
    if (scope === "lifetime" && !weekParam) {
      const weeks = await listCommunityWeeks(24);
      return Response.json({ ok: true, scope, weeks, items: [] });
    }

    const items = await getCommunityFeed({
      scope: weekParam ? "lifetime" : scope,
      weekStart: weekParam ? weekStart : scope === "week" ? weekStart : undefined,
      limit,
    });
    return Response.json({
      ok: true,
      scope,
      weekStart,
      items,
      weeks: [],
    });
  } catch (err) {
    console.error("community feed error:", err);
    return Response.json(
      { ok: false, error: "Failed to load community feed.", items: [], weeks: [] },
      { status: 500 }
    );
  }
}
