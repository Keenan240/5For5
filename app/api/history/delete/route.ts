import { NextResponse } from "next/server";
import { deleteHistoryEntry } from "@/lib/history";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const index = Number(body?.index);
    if (!Number.isInteger(index)) {
      return NextResponse.json(
        { ok: false, error: "index must be an integer" },
        { status: 400 }
      );
    }

    const result = await deleteHistoryEntry(index);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
