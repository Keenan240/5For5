import { fetchJson } from "./fetch";
import { pickBestSlateGame } from "./dates";
import type { GameLog } from "./types";

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

type EspnGameLogResponse = {
  names: string[];
  events: Record<string, { gameDate?: string; gameId?: string }>;
  seasonTypes?: {
    displayName?: string;
    categories?: { events?: { eventId: string; stats: string[] }[] }[];
  }[];
};

function parseEspnGamelogResponse(data: EspnGameLogResponse): GameLog[] {
  const { names, events, seasonTypes } = data;
  const idx = {
    min: names.indexOf("minutes"),
    pts: names.indexOf("points"),
    reb: names.indexOf("totalRebounds"),
    ast: names.indexOf("assists"),
    stl: names.indexOf("steals"),
    blk: names.indexOf("blocks"),
    fg3: names.indexOf("threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
  };

  const rows: GameLog[] = [];

  for (const st of seasonTypes ?? []) {
    for (const cat of st.categories ?? []) {
      for (const e of cat.events ?? []) {
        const meta = events[e.eventId];
        if (!meta?.gameDate) continue;
        const s = e.stats;
        rows.push({
          date: meta.gameDate,
          opponent: st.displayName ?? "",
          pts: Number(s[idx.pts]) || 0,
          reb: Number(s[idx.reb]) || 0,
          ast: Number(s[idx.ast]) || 0,
          fg3m: idx.fg3 >= 0 ? parseMade(s[idx.fg3]) : 0,
          stl: Number(s[idx.stl]) || 0,
          blk: Number(s[idx.blk]) || 0,
          min: idx.min >= 0 ? parseMinutes(s[idx.min]) : 0,
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
  const result = await fetchJson<EspnGameLogResponse>(url, undefined, 15_000);
  if (!result.ok || !result.data) return [];
  const rows = parseEspnGamelogResponse(result.data);
  return rows.slice(0, maxGames).reverse();
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
