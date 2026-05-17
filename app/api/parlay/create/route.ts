import { runCreateParlay } from "@/lib/create-parlay";

export const maxDuration = 300;

export async function POST() {
  try {
    const result = await runCreateParlay(() => {});

    if (result.error && !result.ok) {
      return Response.json(
        {
          error: result.error,
          message: result.message,
          state: result.state,
          qualifiedCount: result.qualifiedCount,
          rosterCount: result.rosterCount,
        },
        { status: 400 }
      );
    }

    return Response.json({
      message: result.message,
      qualifiedCount: result.qualifiedCount,
      rosterCount: result.rosterCount,
      gamesTonight: result.gamesTonight,
      parlay: result.parlay,
      state: result.state,
      ok: result.ok,
    });
  } catch (err) {
    console.error("Create parlay error:", err);
    return Response.json(
      { error: "Failed to create parlay. Check server logs." },
      { status: 500 }
    );
  }
}
