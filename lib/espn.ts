import { fetchJson } from "./fetch";
import { pickBestSlateGame } from "./dates";
import { canonicalTeamAbbrev } from "./h2h";
import type { GameLog, SeasonType } from "./types";

const ESPN_SEARCH =
  "https://site.api.espn.com/apis/common/v3/search";
const ESPN_GAMELOG =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

/** ESPN uses end-year; try both conventions for reliability. */
export function espnSeasonCandidates(): number[] {
  const y = parseInt(process.env.NBA_SEASON || "2025", 10);
  return [...new Set([y + 1, y])];
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const espnIdCache = new Map<string, string>();

export async function getEspnAthleteId(playerName: string): Promise<string | null> {
  const key = normalizeName(playerName);
  if (espnIdCache.has(key)) return espnIdCache.get(key)!;

  const url = `${ESPN_SEARCH}?query=${encodeURIComponent(playerName)}&limit=8&type=player`;
  const result = await fetchJson<{
    items?: { id: string; displayName?: string; type?: string }[];
  }>(url, undefined, 12_000);

  if (!result.ok || !result.data?.items?.length) return null;

  const parts = key.split(" ");
  const match =
    result.data.items.find(
      (i) =>
        i.type === "player" &&
        normalizeName(i.displayName ?? "") === key
    ) ??
    result.data.items.find((i) => {
      if (i.type !== "player") return false;
      const full = normalizeName(i.displayName ?? "");
      return parts.every((p) => full.includes(p));
    });

  if (!match?.id) return null;
  espnIdCache.set(key, match.id);
  return match.id;
}

function parseMade(stat: string): number {
  if (!stat || stat === "--") return 0;
  const made = stat.split("-")[0];
  return parseInt(made, 10) || 0;
}

function parseMinutes(min: string): number {
  if (!min || min === "--") return 0;
  if (min.includes(":")) {
    const [m, s] = min.split(":").map(Number);
    return m + (s || 0) / 60;
  }
  return parseFloat(min) || 0;
}

type EspnEventMeta = {
  gameDate?: string;
  gameId?: string;
  atVs?: string;
  team?: { abbreviation?: string };
  opponent?: { abbreviation?: string; displayName?: string };
};

type EspnGameLogResponse = {
  names?: string[];
  labels?: string[];
  events?: Record<string, EspnEventMeta>;
  seasonTypes?: {
    displayName?: string;
    categories?: { events?: { eventId: string; stats?: string[] }[] }[];
  }[];
};

function seasonTypeFromEspnLabel(displayName: string): SeasonType {
  return /postseason|playoff|play-in/i.test(displayName)
    ? "Playoffs"
    : "Regular Season";
}

function matchupFromEspnEvent(meta: EspnEventMeta): string {
  const teamRaw = meta.team?.abbreviation?.toUpperCase();
  const oppRaw = meta.opponent?.abbreviation?.toUpperCase();
  if (!teamRaw || !oppRaw) {
    const name = meta.opponent?.displayName?.trim();
    return name ?? "";
  }
  const team = canonicalTeamAbbrev(teamRaw);
  const opp = canonicalTeamAbbrev(oppRaw);
  const sep = meta.atVs === "@" ? "@" : "vs.";
  return `${team} ${sep} ${opp}`;
}

function statCol(names: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const i = names.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function statVal(stats: string[] | undefined, col: number): string {
  if (!stats || col < 0 || col >= stats.length) return "";
  return stats[col] ?? "";
}

function parseEspnGamelogResponse(data: unknown): GameLog[] {
  if (!data || typeof data !== "object") return [];

  const body = data as EspnGameLogResponse;
  const names = Array.isArray(body.names)
    ? body.names
    : Array.isArray(body.labels)
      ? body.labels
      : null;

  if (!names?.length) return [];

  const events = body.events ?? {};
  const seasonTypes = body.seasonTypes ?? [];

  const idx = {
    min: statCol(names, "minutes"),
    pts: statCol(names, "points"),
    reb: statCol(names, "totalRebounds", "rebounds"),
    ast: statCol(names, "assists"),
    stl: statCol(names, "steals"),
    blk: statCol(names, "blocks"),
    fg3: statCol(
      names,
      "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
      "threePointFieldGoalsMade"
    ),
  };

  if (idx.pts < 0) return [];

  const rows: GameLog[] = [];

  for (const st of seasonTypes) {
    const seasonType = seasonTypeFromEspnLabel(st.displayName ?? "");
    for (const cat of st.categories ?? []) {
      for (const e of cat.events ?? []) {
        const meta = events[e.eventId];
        if (!meta?.gameDate) continue;
        const matchup = matchupFromEspnEvent(meta);
        if (!matchup) continue;
        const s = e.stats;
        rows.push({
          date: meta.gameDate,
          opponent: matchup,
          seasonType,
          pts: Number(statVal(s, idx.pts)) || 0,
          reb: Number(statVal(s, idx.reb)) || 0,
          ast: Number(statVal(s, idx.ast)) || 0,
          fg3m: idx.fg3 >= 0 ? parseMade(statVal(s, idx.fg3)) : 0,
          stl: Number(statVal(s, idx.stl)) || 0,
          blk: Number(statVal(s, idx.blk)) || 0,
          min: idx.min >= 0 ? parseMinutes(statVal(s, idx.min)) : 0,
        });
      }
    }
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return rows;
}

async function fetchEspnGameLogsForSeason(
  athleteId: string,
  season: number,
  maxGames: number
): Promise<GameLog[]> {
  const url = `${ESPN_GAMELOG}/${athleteId}/gamelog?season=${season}`;
  const result = await fetchJson<unknown>(url, undefined, 15_000);
  if (!result.ok || !result.data) return [];

  try {
    const rows = parseEspnGamelogResponse(result.data);
    return rows.slice(0, maxGames).reverse();
  } catch {
    return [];
  }
}

export async function getEspnGameLogs(
  playerName: string,
  maxGames = 30
): Promise<GameLog[]> {
  const athleteId = await getEspnAthleteId(playerName);
  if (!athleteId) return [];

  const seasons = espnSeasonCandidates();
  const batches = await Promise.all(
    seasons.map((s) => fetchEspnGameLogsForSeason(athleteId, s, maxGames))
  );

  const byKey = new Map<string, GameLog>();
  for (const batch of batches) {
    for (const g of batch) {
      const key = `${g.date}|${g.opponent}|${g.pts}`;
      if (!byKey.has(key)) byKey.set(key, g);
    }
  }

  const merged = [...byKey.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return merged.slice(0, maxGames).reverse();
}

export async function getLast5GamesFromEspn(
  playerName: string
): Promise<GameLog[]> {
  return getEspnGameLogs(playerName, 5);
}

export async function getLatestGameStatFromEspn(
  playerName: string,
  statKey: keyof GameLog
): Promise<{ value: number; min: number } | null> {
  const logs = await getLast5GamesFromEspn(playerName);
  if (!logs.length) return null;
  const latest = logs[logs.length - 1];
  const value = latest[statKey];
  if (typeof value !== "number") return null;
  return { value, min: latest.min };
}

export async function findEspnGameOnSlate(
  playerName: string,
  slateYmd: string
): Promise<{ game: GameLog; matchedYmd: string } | null> {
  const logs = await getEspnGameLogs(playerName, 35);
  return pickBestSlateGame(logs, slateYmd);
}

export async function getGameStatFromEspnForDate(
  playerName: string,
  statKey: keyof GameLog,
  slateYmd: string
): Promise<{ value: number; min: number; matchedYmd: string } | null> {
  const hit = await findEspnGameOnSlate(playerName, slateYmd);
  if (!hit) return null;
  const value = hit.game[statKey];
  if (typeof value !== "number") return null;
  return { value, min: hit.game.min, matchedYmd: hit.matchedYmd };
}
