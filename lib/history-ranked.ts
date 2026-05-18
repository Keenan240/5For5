import { filterSlateByIncludedGames } from "./slate-games";
import { discoverTonightCandidates } from "./scoring";
import { settleRankedPick } from "./settle";
import { getSlateForDate } from "./tonight";
import { loadPlayerIdMap } from "./stats";
import type {
  ParlayLeg,
  RankedPoolPick,
  SettledParlay,
  SettledRankedPick,
} from "./types";

function poolPickKey(p: {
  player: string;
  stat: string;
  threshold: number;
}): string {
  return `${p.player}|${p.stat}|${p.threshold}`;
}

function gamesForParlayTeams(
  slate: Awaited<ReturnType<typeof getSlateForDate>>,
  legs: ParlayLeg[]
) {
  const teams = new Set(legs.map((l) => l.team.toUpperCase()));
  return slate.games.filter(
    (g) => teams.has(g.home.toUpperCase()) || teams.has(g.away.toUpperCase())
  );
}

async function settleRankedPool(
  pool: RankedPoolPick[],
  slateDate: string,
  idMap: Awaited<ReturnType<typeof loadPlayerIdMap>>
): Promise<SettledRankedPick[]> {
  return Promise.all(
    pool.map((pick) => settleRankedPick(pick, slateDate, idMap))
  );
}

/**
 * Resolve alternate ranked picks for history using place-time lines when
 * available, otherwise discovery with last-5 excluding the slate night.
 */
export async function buildRankedResultsForParlay(
  parlay: SettledParlay
): Promise<SettledRankedPick[]> {
  const idMap = await loadPlayerIdMap();

  if (parlay.rankedPool?.length) {
    return settleRankedPool(parlay.rankedPool, parlay.date, idMap);
  }

  const slate = await getSlateForDate(parlay.date);
  const games = gamesForParlayTeams(slate, parlay.legs);
  if (games.length === 0) {
    throw new Error(
      `No slate games found for ${parlay.date} matching this parlay's teams.`
    );
  }

  const filtered = filterSlateByIncludedGames(slate, games);
  const { candidates } = await discoverTonightCandidates(filtered, {
    beforeSlateYmd: parlay.date,
  });
  if (candidates.length === 0) {
    throw new Error("No qualifying candidates found for that date.");
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const inParlayKeys = new Set(parlay.legs.map(poolPickKey));

  const pool: RankedPoolPick[] = sorted.map((c, i) => ({
    player: c.player,
    team: c.team,
    stat: c.stat,
    threshold: c.threshold,
    rank: i + 1,
    inParlay: inParlayKeys.has(poolPickKey(c)),
  }));

  return settleRankedPool(pool, parlay.date, idMap);
}
