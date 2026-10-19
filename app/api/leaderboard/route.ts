import { getLeaderboard } from "@/lib/leaderboard";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope =
    url.searchParams.get("scope") === "week" ? "week" : "lifetime";
  const limitRaw = Number(url.searchParams.get("limit") ?? "25");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
    : 25;

  try {
    const rows = await getLeaderboard(scope, limit);
    return Response.json({ ok: true, scope, rows });
  } catch (err) {
    console.error("leaderboard error:", err);
    return Response.json(
      { ok: false, error: "Failed to load leaderboard.", rows: [] },
      { status: 500 }
    );
  }
}
