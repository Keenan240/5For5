import { NextResponse } from "next/server";
import {
  getCachedStreakScan,
  lastCompletedSlateYmd,
  scanStreakEvents,
  setCachedStreakScan,
} from "@/lib/streak-events";
import { getSlateForDate } from "@/lib/tonight";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date")?.trim();
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : lastCompletedSlateYmd();

    const cached = getCachedStreakScan(date);
    if (cached && url.searchParams.get("refresh") !== "1") {
      return NextResponse.json({ ...cached, cached: true });
    }

    const slate = await getSlateForDate(date);
    if (!slate.games.length) {
      return NextResponse.json({
        date,
        events: [],
        rosterCount: 0,
        scannedCount: 0,
        games: [],
        cached: false,
        empty: true,
      });
    }

    const result = await scanStreakEvents(slate);
    setCachedStreakScan(result);
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Streak scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
