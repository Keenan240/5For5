import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth-user";
import { backfillHistoryRanked } from "@/lib/history";

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

    const result = await backfillHistoryRanked(index, gate.user.id);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
