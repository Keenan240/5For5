import { addDaysYmd, getTodayEastern, normalizeGameLogDate } from "./dates";
import {
  discoverMilestone,
  extractStatValues,
  LADDERS,
  qualifiesForMilestone,
  STAT_CATEGORIES,
  STAT_KEY,
} from "./milestones";
import { mapWithConcurrency } from "./concurrency";
import {
  getPlayerFullGameLogs,
  loadPlayerIdMap,
  takeLast5Official,
  type PlayerFullLogCache,
} from "./stats";
import type { TonightSlate } from "./tonight";
import type { GameLog, StatCategory } from "./types";

export type StreakKind = "broken" | "created";

export type StreakEvent = {
  kind: StreakKind;
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  last5Pre: number[];
  last5Post: number[];
  nightValue: number | null;
  espnAthleteId?: string;
};

export type StreakScanResult = {
  date: string;
  events: StreakEvent[];
  rosterCount: number;
  scannedCount: number;
  games: { home: string; away: string; status: string }[];
};

const SCAN_CONCURRENCY = 20;

/** Most recent slate night (Eastern). Games wrap ~3:30am ET. */
export function lastCompletedSlateYmd(): string {
  // Yesterday ET. Before ~4am, box scores for that night may still be landing.
  return addDaysYmd(getTodayEastern(), -1);
}

function nightStatValue(
  logs: GameLog[],
  slateYmd: string,
  stat: StatCategory
): number | null {
  const key = STAT_KEY[stat];
  const hit = logs.find((g) => {
    const ymd = normalizeGameLogDate(g.date);
    return ymd === slateYmd || ymd === addDaysYmd(slateYmd, 1);
  });
  if (!hit) return null;
  return hit[key] as number;
}

function eventsForPlayer(
  player: string,
  team: string,
  espnAthleteId: string | undefined,
  logs: GameLog[],
  slateYmd: string
): StreakEvent[] {
  const preLogs = takeLast5Official(logs, { beforeSlateYmd: slateYmd });
  const postLogs = takeLast5Official(logs);
  const out: StreakEvent[] = [];

  for (const stat of STAT_CATEGORIES) {
    const preVals = extractStatValues(preLogs, stat);
    const postVals = extractStatValues(postLogs, stat);
    const preHigh = discoverMilestone(preVals, LADDERS[stat]);
    const postHigh = discoverMilestone(postVals, LADDERS[stat]);
    const nightValue = nightStatValue(logs, slateYmd, stat);

    // Created: highest rung that post has and pre does not
    if (postHigh != null) {
      let created: number | null = null;
      for (const t of LADDERS[stat]) {
        if (t > postHigh) break;
        const postOk = qualifiesForMilestone(postVals, t);
        const preOk = qualifiesForMilestone(preVals, t);
        if (postOk && !preOk) created = t;
      }
      if (created != null) {
        out.push({
          kind: "created",
          player,
          team,
          stat,
          threshold: created,
          last5Pre: preVals,
          last5Post: postVals,
          nightValue,
          espnAthleteId,
        });
      }
    }

    // Broken: highest rung that pre had and post lost
    if (preHigh != null) {
      let broken: number | null = null;
      for (const t of LADDERS[stat]) {
        if (t > preHigh) break;
        const preOk = qualifiesForMilestone(preVals, t);
        const postOk = qualifiesForMilestone(postVals, t);
        if (preOk && !postOk) broken = t;
      }
      if (broken != null) {
        out.push({
          kind: "broken",
          player,
          team,
          stat,
          threshold: broken,
          last5Pre: preVals,
          last5Post: postVals,
          nightValue,
          espnAthleteId,
        });
      }
    }
  }

  return out;
}

export async function scanStreakEvents(
  slate: TonightSlate
): Promise<StreakScanResult> {
  const idMap = await loadPlayerIdMap();
  const fullCache: PlayerFullLogCache = new Map();
  const slateYmd = slate.date;

  const batches = await mapWithConcurrency(
    slate.players,
    SCAN_CONCURRENCY,
    async (p) => {
      try {
        const logs = await getPlayerFullGameLogs(
          p.player,
          idMap,
          fullCache,
          p.nbaPlayerId,
          p.espnAthleteId
        );
        if (logs.length < 5) return [] as StreakEvent[];
        // Need the night game present for meaningful post window
        const played = logs.some((g) => {
          const ymd = normalizeGameLogDate(g.date);
          return ymd === slateYmd || ymd === addDaysYmd(slateYmd, 1);
        });
        if (!played) return [] as StreakEvent[];
        return eventsForPlayer(
          p.player,
          p.team,
          p.espnAthleteId,
          logs,
          slateYmd
        );
      } catch {
        return [] as StreakEvent[];
      }
    }
  );

  const events = batches.flat();
  events.sort((a, b) => {
    if (a.stat !== b.stat) {
      return STAT_CATEGORIES.indexOf(a.stat) - STAT_CATEGORIES.indexOf(b.stat);
    }
    return b.threshold - a.threshold;
  });

  return {
    date: slateYmd,
    events,
    rosterCount: slate.players.length,
    scannedCount: slate.players.length,
    games: slate.games.map((g) => ({
      home: g.home,
      away: g.away,
      status: g.status,
    })),
  };
}

type CacheEntry = { at: number; result: StreakScanResult };
const resultCache = new Map<string, CacheEntry>();
const CACHE_MS = 30 * 60 * 1000;

export function getCachedStreakScan(date: string): StreakScanResult | null {
  const hit = resultCache.get(date);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    resultCache.delete(date);
    return null;
  }
  return hit.result;
}

export function setCachedStreakScan(result: StreakScanResult): void {
  resultCache.set(result.date, { at: Date.now(), result });
}
