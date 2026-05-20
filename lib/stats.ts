import { fetchJson } from "./fetch";
import {
  normalizeGameLogDate,
  pickBestSlateGame,
  slateDateCandidates,
} from "./dates";
import {
  findEspnGameOnSlate,
  getEspnGameLogs,
  getLast5GamesFromEspn,
  getLatestGameStatFromEspn,
} from "./espn";
import { looksLikeMatchup } from "./h2h";
import { STAT_KEY } from "./milestones";
import { cachedFetch } from "./stats-cache";
import type { GameLog, StatCategory } from "./types";

const NBA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  Accept: "application/json",
};

const NBA_TIMEOUT_MS = 10_000;

type SeasonType = "Regular Season" | "Playoffs";

export type SlateGameResolution = {
  ready: boolean;
  player: string;
  stat: StatCategory;
  threshold: number;
  source: "nba" | "espn" | null;
  matchedDate: string | null;
  actualValue: number | null;
  hit: boolean | null;
  error?: string;
};

export type LegForSlateCheck = {
  player: string;
  stat: StatCategory;
  threshold: number;
};

function seasonLabel(): string {
  const y = parseInt(process.env.NBA_SEASON || "2025", 10);
  return `${y}-${String(y + 1).slice(-2)}`;
}

let playerIdCache: Map<string, string> | null = null;
let playerIdCacheSeason: string | null = null;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadPlayerIdMap(): Promise<Map<string, string>> {
  const season = seasonLabel();
  if (playerIdCache && playerIdCacheSeason === season) {
    return playerIdCache;
  }

  const url = `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${season}&IsOnlyCurrentSeason=1`;
  const result = await fetchJson<{
    resultSets: { headers: string[]; rowSet: unknown[][] }[];
  }>(url, { headers: NBA_HEADERS }, NBA_TIMEOUT_MS);

  const map = new Map<string, string>();

  if (result.ok && result.data) {
    const rs = result.data.resultSets[0];
    const h = rs.headers;
    const nameIdx = h.indexOf("DISPLAY_FIRST_LAST");
    const idIdx = h.indexOf("PERSON_ID");

    for (const row of rs.rowSet) {
      const name = String(row[nameIdx]);
      map.set(normalizeName(name), String(row[idIdx]));
    }
  }

  playerIdCache = map;
  playerIdCacheSeason = season;
  return map;
}

export async function getPlayerId(
  playerName: string,
  idMap?: Map<string, string>,
  explicitNbaId?: string
): Promise<string | null> {
  if (explicitNbaId) return explicitNbaId;

  const map = idMap ?? (await loadPlayerIdMap());
  const key = normalizeName(playerName);
  if (map.has(key)) return map.get(key)!;

  const parts = key.split(" ");
  for (const [name, id] of map) {
    if (parts.every((p) => name.includes(p))) return id;
  }
  return null;
}

async function fetchGameLogsForType(
  playerId: string,
  seasonType: SeasonType
): Promise<GameLog[]> {
  const season = seasonLabel();
  const url = `https://stats.nba.com/stats/playergamelog?PlayerID=${playerId}&Season=${season}&SeasonType=${encodeURIComponent(seasonType)}`;
  const result = await fetchJson<{
    resultSets: { headers: string[]; rowSet: unknown[][] }[];
  }>(url, { headers: NBA_HEADERS }, NBA_TIMEOUT_MS);

  if (!result.ok || !result.data) return [];

  const rows = result.data.resultSets[0].rowSet;
  if (!rows?.length) return [];

  const h = result.data.resultSets[0].headers;
  const col = (name: string) => h.indexOf(name);

  return rows.map((r) => ({
    date: normalizeGameLogDate(String(r[col("GAME_DATE")])),
    opponent: String(r[col("MATCHUP")]),
    seasonType,
    pts: Number(r[col("PTS")]),
    reb: Number(r[col("REB")]),
    ast: Number(r[col("AST")]),
    fg3m: Number(r[col("FG3M")]),
    stl: Number(r[col("STL")]),
    blk: Number(r[col("BLK")]),
    min: parseMinutes(String(r[col("MIN")])),
  }));
}

async function fetchAllGameLogs(playerId: string): Promise<GameLog[]> {
  const cacheKey = `nba-logs:v2:${playerId}`;
  return cachedFetch(cacheKey, async () => {
    const [regular, playoffs] = await Promise.all([
      fetchGameLogsForType(playerId, "Regular Season"),
      fetchGameLogsForType(playerId, "Playoffs"),
    ]);
    return [...regular, ...playoffs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });
}

async function findNbaGameOnSlate(
  playerId: string,
  slateYmd: string,
  exactDateOnly = false
): Promise<{ game: GameLog; matchedYmd: string } | null> {
  const logs = await fetchAllGameLogs(playerId);
  return pickBestSlateGame(logs, slateYmd, { exactDateOnly });
}

export type PlayerLogCache = Map<string, GameLog[]>;
export type PlayerFullLogCache = Map<string, GameLog[]>;

export type Last5GamesOptions = {
  /** Omit games on the slate calendar night (±1 day) — pre-lock discovery / history. */
  beforeSlateYmd?: string;
};

function last5CacheKey(playerId: string, opts?: Last5GamesOptions): string {
  return opts?.beforeSlateYmd ? `${playerId}:pre:${opts.beforeSlateYmd}` : playerId;
}

function isOnSlateNight(logDate: string, slateYmd: string): boolean {
  const ymd = normalizeGameLogDate(logDate);
  return slateDateCandidates(slateYmd).includes(ymd);
}

async function fetchLast5FromNba(
  playerId: string,
  cache?: PlayerLogCache,
  opts?: Last5GamesOptions
): Promise<GameLog[]> {
  const key = last5CacheKey(playerId, opts);
  if (cache?.has(key)) return cache.get(key)!;

  let combined = await fetchAllGameLogs(playerId);
  if (opts?.beforeSlateYmd) {
    combined = combined.filter(
      (g) => !isOnSlateNight(g.date, opts.beforeSlateYmd!)
    );
  }
  const last5 = combined.slice(0, 5).reverse();
  cache?.set(key, last5);
  return last5;
}

function mergeGameLogs(primary: GameLog[], supplemental: GameLog[]): GameLog[] {
  const byDate = new Map<string, GameLog>();
  for (const g of supplemental) {
    byDate.set(normalizeGameLogDate(g.date), g);
  }
  for (const g of primary) {
    const key = normalizeGameLogDate(g.date);
    const existing = byDate.get(key);
    if (!existing) {
      byDate.set(key, g);
      continue;
    }
    const usePrimary =
      looksLikeMatchup(g.opponent) || !looksLikeMatchup(existing.opponent);
    byDate.set(
      key,
      usePrimary
        ? { ...g, seasonType: g.seasonType ?? existing.seasonType }
        : existing
    );
  }
  return [...byDate.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/** Full season log (newest first) — for H2H discovery. */
export async function getPlayerFullGameLogs(
  playerName: string,
  idMap?: Map<string, string>,
  fullCache?: PlayerFullLogCache,
  explicitNbaId?: string
): Promise<GameLog[]> {
  const playerId = await getPlayerId(playerName, idMap, explicitNbaId);
  if (playerId && fullCache?.has(playerId)) {
    return fullCache.get(playerId)!;
  }

  let logs: GameLog[] = [];
  if (playerId) {
    logs = await fetchAllGameLogs(playerId);
  }

  const matchupRows = logs.filter((g) => looksLikeMatchup(g.opponent)).length;
  const needsEspn =
    logs.length < 5 ||
    (logs.length > 0 && matchupRows < Math.min(5, logs.length));

  if (needsEspn) {
    const espnLogs = await getEspnGameLogs(playerName, 82);
    if (espnLogs.length) {
      logs =
        logs.length === 0
          ? espnLogs
          : mergeGameLogs(logs, espnLogs);
    }
  }

  if (playerId && fullCache) fullCache.set(playerId, logs);
  return logs;
}

/** Last 5 games — NBA stats when available, ESPN when NBA fails */
export async function getLast5Games(
  playerName: string,
  idMap?: Map<string, string>,
  cache?: PlayerLogCache,
  explicitNbaId?: string,
  opts?: Last5GamesOptions
): Promise<GameLog[]> {
  const playerId = await getPlayerId(playerName, idMap, explicitNbaId);
  let last5: GameLog[] = [];

  if (playerId) {
    last5 = await fetchLast5FromNba(playerId, cache, opts);
  }

  if (last5.length < 5) {
    const espnLogs = opts?.beforeSlateYmd
      ? (await getEspnGameLogs(playerName, 40)).filter(
          (g) => !isOnSlateNight(g.date, opts.beforeSlateYmd!)
        ).slice(-5)
      : await getLast5GamesFromEspn(playerName);
    if (espnLogs.length >= last5.length) {
      last5 = espnLogs;
      if (playerId && cache) {
        cache.set(last5CacheKey(playerId, opts), last5);
      }
    }
  }

  return last5;
}

export const getLast5PlayoffGames = getLast5Games;

export async function getLatestGameStat(
  playerName: string,
  statKey: keyof GameLog,
  idMap?: Map<string, string>,
  explicitNbaId?: string
): Promise<{ value: number; min: number } | null> {
  const playerId = await getPlayerId(playerName, idMap, explicitNbaId);

  if (playerId) {
    const combined = await fetchAllGameLogs(playerId);
    const latest = combined[0];
    if (latest) {
      const value = latest[statKey as keyof GameLog];
      if (typeof value === "number") {
        return { value, min: latest.min };
      }
    }
  }

  return getLatestGameStatFromEspn(playerName, statKey);
}

export const getLatestPlayoffStat = getLatestGameStat;

export type GameStatForDateOptions = {
  /** Only accept a box score on the parlay calendar date (pending UI). */
  exactDateOnly?: boolean;
};

/** NBA + ESPN in parallel for the leg's milestone stat on the slate date. */
export async function resolveLegOnSlate(
  leg: LegForSlateCheck,
  slateYmd: string,
  idMap?: Map<string, string>,
  explicitNbaId?: string
): Promise<SlateGameResolution> {
  const statKey = STAT_KEY[leg.stat];
  const cacheKey = `leg:exact:${normalizeName(leg.player)}:${slateYmd}:${leg.stat}`;
  return cachedFetch(cacheKey, async () => {
    const base = {
      player: leg.player,
      stat: leg.stat,
      threshold: leg.threshold,
    };

    const playerId = await getPlayerId(leg.player, idMap, explicitNbaId);
    const statHit = await getGameStatForDate(
      leg.player,
      statKey,
      slateYmd,
      idMap,
      explicitNbaId,
      { exactDateOnly: true }
    );

    if (!statHit) {
      return {
        ...base,
        ready: false,
        source: null,
        matchedDate: null,
        actualValue: null,
        hit: null,
        error: playerId ? "no_slate_game_in_feeds" : "player_not_found",
      };
    }

    const actualValue = statHit.value;
    return {
      ...base,
      ready: true,
      source: statHit.source,
      matchedDate: statHit.matchedYmd,
      actualValue,
      hit: actualValue >= leg.threshold,
    };
  });
}

function pickStatHit(
  nbaHit: {
    value: number;
    min: number;
    matchedYmd: string;
    source: "nba";
  } | null,
  espnStat: {
    value: number;
    min: number;
    matchedYmd: string;
    source: "espn";
  } | null,
  slateYmd: string,
  exactDateOnly: boolean
) {
  if (exactDateOnly) {
    if (nbaHit?.matchedYmd === slateYmd) return nbaHit;
    if (espnStat?.matchedYmd === slateYmd) return espnStat;
    return null;
  }

  if (nbaHit && espnStat) {
    if (nbaHit.matchedYmd === slateYmd) return nbaHit;
    if (espnStat.matchedYmd === slateYmd) return espnStat;
    return nbaHit;
  }
  return nbaHit ?? espnStat;
}

export async function getGameStatForDate(
  playerName: string,
  statKey: keyof GameLog,
  slateYmd: string,
  idMap?: Map<string, string>,
  explicitNbaId?: string,
  options: GameStatForDateOptions = {}
): Promise<{
  value: number;
  min: number;
  matchedYmd: string;
  source: "nba" | "espn";
} | null> {
  const exact = options.exactDateOnly ? ":exact" : "";
  const cacheKey = `stat:${normalizeName(playerName)}:${slateYmd}:${statKey}${exact}`;
  return cachedFetch(cacheKey, async () => {
    const playerId = await getPlayerId(playerName, idMap, explicitNbaId);
    const exactDateOnly = options.exactDateOnly ?? false;

    const [nbaHit, espnStat] = await Promise.all([
      playerId
        ? findNbaGameOnSlate(playerId, slateYmd, exactDateOnly).then((hit) => {
            if (!hit) return null;
            const value = hit.game[statKey as keyof GameLog];
            if (typeof value !== "number") return null;
            return {
              value,
              min: hit.game.min,
              matchedYmd: hit.matchedYmd,
              source: "nba" as const,
            };
          })
        : Promise.resolve(null),
      findEspnGameOnSlate(playerName, slateYmd, exactDateOnly).then((hit) => {
        if (!hit) return null;
        const value = hit.game[statKey];
        if (typeof value !== "number") return null;
        return {
          value,
          min: hit.game.min,
          matchedYmd: hit.matchedYmd,
          source: "espn" as const,
        };
      }),
    ]);

    const pick = pickStatHit(nbaHit, espnStat, slateYmd, exactDateOnly);
    if (!pick) return null;
    return {
      value: pick.value,
      min: pick.min,
      matchedYmd: pick.matchedYmd,
      source: pick.source,
    };
  });
}

export async function checkAllLegsStatsReady(
  legs: LegForSlateCheck[],
  slateYmd: string,
  idMap?: Map<string, string>
): Promise<{ ready: boolean; legs: SlateGameResolution[] }> {
  const map = idMap ?? (await loadPlayerIdMap());
  const legResults = await Promise.all(
    legs.map((leg) => resolveLegOnSlate(leg, slateYmd, map))
  );
  return {
    ready: legResults.every((r) => r.ready),
    legs: legResults,
  };
}

function parseMinutes(min: string): number {
  if (!min || min === "DNP") return 0;
  if (min.includes(":")) {
    const [m, s] = min.split(":").map(Number);
    return m + (s || 0) / 60;
  }
  return parseFloat(min) || 0;
}
