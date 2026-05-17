import { getTonightSlate } from "@/lib/tonight";
import { loadPlayerIdMap, getLast5Games } from "@/lib/stats";
import {
  STAT_CATEGORIES,
  LADDERS,
  discoverMilestone,
  extractStatValues,
} from "@/lib/milestones";
import { passesOddsCap, estimateOddsFromBuffer } from "@/lib/odds";
import type { StatCategory } from "@/lib/types";

export async function GET() {
  const slate = await getTonightSlate();
  const idMap = await loadPlayerIdMap();
  const roster = slate.players;

  const noId: string[] = [];
  const shortLogs: { player: string; count: number }[] = [];
  const allMilestones: {
    player: string;
    team: string;
    stat: StatCategory;
    threshold: number;
    last5: number[];
    odds: number;
    passesOdds: boolean;
  }[] = [];

  for (const p of roster) {
    const pid = await import("@/lib/stats").then((m) =>
      m.getPlayerId(p.player, idMap)
    );
    if (!pid) noId.push(p.player);

    const logs = await getLast5Games(p.player, idMap);
    if (logs.length < 5) {
      shortLogs.push({ player: p.player, count: logs.length });
      continue;
    }

    for (const stat of STAT_CATEGORIES) {
      const values = extractStatValues(logs, stat);
      const threshold = discoverMilestone(values, LADDERS[stat]);
      if (threshold === null) continue;
      const buffer =
        values.reduce((s, v) => s + (v - threshold), 0) / values.length;
      const odds = estimateOddsFromBuffer(buffer, stat);
      allMilestones.push({
        player: p.player,
        team: p.team,
        stat,
        threshold,
        last5: values,
        odds,
        passesOdds: passesOddsCap(odds),
      });
    }
  }

  const afterOdds = allMilestones.filter((m) => m.passesOdds);
  const byPlayer = new Map<string, (typeof allMilestones)[0]>();
  for (const m of afterOdds) {
    const ex = byPlayer.get(m.player);
    if (!ex) byPlayer.set(m.player, m);
  }

  return Response.json({
    slate: {
      date: slate.date,
      games: slate.games,
      rosterCount: slate.players.length,
      evaluated: roster.length,
      source: slate.source,
    },
    funnel: {
      noId: noId.length,
      shortLogs: shortLogs.length,
      totalMilestoneLegs: allMilestones.length,
      afterOddsCap: afterOdds.length,
      finalOnePerPlayer: byPlayer.size,
    },
    noId,
    shortLogs: shortLogs.slice(0, 15),
    allMilestones,
    finalPool: [...byPlayer.values()],
  });
}
