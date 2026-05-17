import { getState } from "@/lib/kv";
import { getTonightSlate } from "@/lib/tonight";

export async function GET() {
  const state = await getState();
  const slate = await getTonightSlate();

  return Response.json({
    ...state,
    qualifiedCount: null,
    sliderMax: 8,
    slate: {
      date: slate.date,
      games: slate.games,
      rosterCount: slate.players.length,
      source: slate.source,
      rosterSource: slate.rosterSource,
    },
  });
}
