import { fetchJson } from "./fetch";
import {
  bdlHeaders,
  bdlSeasonCandidates,
  hasBdlKey,
  nbaSeasonYear,
  nbaSeasonYearForDate,
} from "./bdl-client";
import { canonicalTeamAbbrev } from "./h2h";
import { nbaTeamId } from "./nba-teams";
import { fetchRostersFromEspn } from "./espn-roster";
import { formatGameTimeLabel } from "./game-time";
import type { TonightPlayer } from "./scoring";

const BDL_BASE = "https://api.balldontlie.io/v1";

const NBA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://www.nba.com",
  Origin: "https://www.nba.com",
  Accept: "application/json",
};

const NBA_ROSTER_TIMEOUT_MS = 25_000;

export type TonightSlate = {
  date: string;
  games: TonightGame[];
  players: TonightPlayer[];
  teamIds: number[];
  source: "balldontlie" | "espn" | "nba";
  rosterSource: "espn" | "nba-team-roster" | "nba-all-players" | "none";
};

export type TonightGame = {
  home: string;
  away: string;
  status: string;
  postseason: boolean;
  homeTeamId?: number;
  awayTeamId?: number;
};

type BdlGame = {
  date: string;
  datetime?: string;
  status: string;
  postseason: boolean;
  home_team: { id: number; abbreviation: string };
  visitor_team: { id: number; abbreviation: string };
};

type SlateCacheEntry = { slate: TonightSlate; at: number };
/** Per-date cache — avoids one night's empty result sticking on another. */
const slateCache = new Map<string, SlateCacheEntry>();
const CACHE_MS = 10 * 60 * 1000;
const EMPTY_CACHE_MS = 45_000;

export function getTodayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function seasonLabel(forDate?: string): string {
  const y = forDate ? nbaSeasonYearForDate(forDate) : nbaSeasonYear();
  return `${y}-${String(y + 1).slice(-2)}`;
}

function uniqueAbbrevs(games: { home: string; away: string }[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    set.add(g.home.toUpperCase());
    set.add(g.away.toUpperCase());
  }
  return [...set];
}

function cacheTtlMs(slate: TonightSlate): number {
  return slate.games.length === 0 ? EMPTY_CACHE_MS : CACHE_MS;
}

export type GetSlateOptions = {
  fresh?: boolean;
  /** Scoreboard only — skip roster hydration (status/UI). */
  gamesOnly?: boolean;
};

export async function getSlateForDate(
  date: string,
  opts?: GetSlateOptions
): Promise<TonightSlate> {
  const gamesOnly = opts?.gamesOnly === true;
  const cacheKey = `${date}-v9${gamesOnly ? "-g" : ""}`;
  const hit = slateCache.get(cacheKey);
  const age = hit ? Date.now() - hit.at : Infinity;
  const ttl = hit ? cacheTtlMs(hit.slate) : 0;

  if (hit && age < ttl) {
    if (!opts?.fresh || age < 30_000) {
      return hit.slate;
    }
    const refreshed = await refreshGameStatuses(hit.slate, gamesOnly);
    slateCache.set(cacheKey, { slate: refreshed, at: Date.now() });
    return refreshed;
  }

  // ESPN first (public + fast), then BDL. NBA stats is slow/flaky from
  // serverless — only use it when we need full rosters (discovery), not status.
  let slate: TonightSlate | null = await getSlateFromEspn(date, gamesOnly);

  if ((!slate || slate.games.length === 0) && hasBdlKey()) {
    const bdlSlate = await getSlateFromBdl(date, gamesOnly);
    if (bdlSlate && bdlSlate.games.length > 0) {
      slate = bdlSlate;
    } else if (!slate) {
      slate = bdlSlate;
    }
  }

  if (!gamesOnly && (!slate || slate.games.length === 0)) {
    const nbaSlate = await getSlateFromNba(date, false);
    if (nbaSlate.games.length > 0 || !slate) {
      slate = nbaSlate;
    }
  }

  const finalSlate = slate ?? emptySlate(date, "espn");
  slateCache.set(cacheKey, { slate: finalSlate, at: Date.now() });
  return finalSlate;
}

export async function getTonightSlate(): Promise<TonightSlate> {
  return getSlateForDate(getTodayEastern());
}

/** Games from BallDontLie; rosters via ESPN/NBA. null = request failed. */
async function getSlateFromBdl(
  date: string,
  gamesOnly = false
): Promise<TonightSlate | null> {
  // Prefer date-only (avoids wrong seasons[] filtering out opening night).
  // If empty, retry with season candidates derived from the calendar date.
  let gamesResult = await fetchJson<{ data: BdlGame[] }>(
    `${BDL_BASE}/games?dates[]=${date}&per_page=100`,
    { headers: bdlHeaders() }
  );

  if (!gamesResult.ok) return null;

  let games = (gamesResult.data?.data ?? []).filter(
    (g) => normalizeBdlGameDate(g) === date
  );
  if (games.length === 0) {
    const seasons = bdlSeasonCandidates(date)
      .map((s) => `seasons[]=${s}`)
      .join("&");
    gamesResult = await fetchJson<{ data: BdlGame[] }>(
      `${BDL_BASE}/games?dates[]=${date}&${seasons}&per_page=100`,
      { headers: bdlHeaders() }
    );
    if (!gamesResult.ok) return null;
    games = (gamesResult.data?.data ?? []).filter(
      (g) => normalizeBdlGameDate(g) === date
    );
  }

  if (games.length === 0) {
    return emptySlate(date, "balldontlie");
  }

  const slateGames: TonightGame[] = games.map((g) => ({
    home: canonicalTeamAbbrev(g.home_team.abbreviation),
    away: canonicalTeamAbbrev(g.visitor_team.abbreviation),
    status: formatGameTimeLabel({
      datetimeUtc: g.datetime,
      statusText: g.status,
    }),
    postseason: g.postseason,
  }));

  if (gamesOnly) {
    return {
      date,
      games: slateGames,
      players: [],
      teamIds: [],
      source: "balldontlie",
      rosterSource: "none",
    };
  }

  const abbrevs = uniqueAbbrevs(slateGames);
  const { players, rosterSource, teamIds } = await resolveRostersForTeams(abbrevs);

  return {
    date,
    games: slateGames,
    players,
    teamIds,
    source: "balldontlie",
    rosterSource,
  };
}

function normalizeBdlGameDate(g: BdlGame): string {
  const raw = (g.date || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (g.datetime) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(new Date(g.datetime));
  }
  return raw;
}

const ESPN_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (compatible; 5For5/1.0; +https://github.com/Keenan240/5For5)",
  Accept: "application/json",
};

async function getSlateFromEspn(
  date: string,
  gamesOnly = false
): Promise<TonightSlate> {
  const compact = date.replace(/-/g, "");
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${compact}`;
  const result = await fetchJson<{
    events?: {
      date?: string;
      competitions?: {
        date?: string;
        competitors?: {
          homeAway?: string;
          team?: { abbreviation?: string };
        }[];
        status?: { type?: { description?: string; detail?: string } };
      }[];
    }[];
  }>(url, { headers: ESPN_HEADERS }, 8_000);

  if (!result.ok || !result.data?.events?.length) {
    return emptySlate(date, "espn");
  }

  const games: TonightGame[] = [];
  for (const event of result.data.events) {
    const comp = event.competitions?.[0];
    if (!comp?.competitors?.length) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    const homeAbbr = home?.team?.abbreviation
      ? canonicalTeamAbbrev(home.team.abbreviation)
      : null;
    const awayAbbr = away?.team?.abbreviation
      ? canonicalTeamAbbrev(away.team.abbreviation)
      : null;
    if (!homeAbbr || !awayAbbr) continue;

    const statusText =
      comp.status?.type?.detail ||
      comp.status?.type?.description ||
      "";
    games.push({
      home: homeAbbr,
      away: awayAbbr,
      status: formatGameTimeLabel({
        datetimeUtc: comp.date || event.date,
        statusText,
      }),
      postseason: false,
    });
  }

  if (games.length === 0) {
    return emptySlate(date, "espn");
  }

  if (gamesOnly) {
    return {
      date,
      games,
      players: [],
      teamIds: [],
      source: "espn",
      rosterSource: "none",
    };
  }

  const abbrevs = uniqueAbbrevs(games);
  const { players, rosterSource, teamIds } = await resolveRostersForTeams(abbrevs);

  return {
    date,
    games,
    players,
    teamIds,
    source: "espn",
    rosterSource,
  };
}

async function getSlateFromNba(
  date: string,
  gamesOnly = false
): Promise<TonightSlate> {
  const scoreboard = await fetchNbaScoreboard(date);
  const abbrevs =
    scoreboard.games.length > 0
      ? uniqueAbbrevs(scoreboard.games)
      : [];

  if (gamesOnly || abbrevs.length === 0) {
    return {
      date,
      games: scoreboard.games,
      players: [],
      teamIds: scoreboard.teamIds,
      source: "nba",
      rosterSource: "none",
    };
  }

  const { players, rosterSource, teamIds } =
    await resolveRostersForTeams(abbrevs);

  return {
    date,
    games: scoreboard.games,
    players,
    teamIds: teamIds.length > 0 ? teamIds : scoreboard.teamIds,
    source: "nba",
    rosterSource,
  };
}

async function resolveRostersForTeams(abbrevs: string[]): Promise<{
  players: TonightPlayer[];
  rosterSource: TonightSlate["rosterSource"];
  teamIds: number[];
}> {
  if (abbrevs.length === 0) {
    return { players: [], rosterSource: "none", teamIds: [] };
  }

  const teamIds = abbrevs
    .map((a) => nbaTeamId(a))
    .filter((id): id is number => id != null);

  try {
    const byEspn = await fetchRostersFromEspn(abbrevs);
    if (byEspn.length > 0) {
      return { players: byEspn, rosterSource: "espn", teamIds };
    }
  } catch (err) {
    console.error("ESPN roster fetch failed:", err);
  }

  // stats.nba.com is unreliable from Vercel — keep a short fallback only.
  if (process.env.VERCEL) {
    return { players: [], rosterSource: "none", teamIds };
  }

  try {
    const [byTeam, byAll] = await Promise.all([
      fetchRostersByAbbreviations(abbrevs),
      fetchRosterViaCommonAllPlayers(abbrevs),
    ]);

    if (byTeam.length > 0) {
      return { players: byTeam, rosterSource: "nba-team-roster", teamIds };
    }
    if (byAll.length > 0) {
      return { players: byAll, rosterSource: "nba-all-players", teamIds };
    }
  } catch (err) {
    console.error("NBA roster fallback failed:", err);
  }

  return { players: [], rosterSource: "none", teamIds };
}

/** commonteamroster per team — does not need today's scoreboard */
async function fetchRostersByAbbreviations(
  abbrevs: string[]
): Promise<TonightPlayer[]> {
  const season = seasonLabel();
  const players: TonightPlayer[] = [];

  await Promise.all(
    abbrevs.map(async (abbrev) => {
      const teamId = nbaTeamId(abbrev);
      if (!teamId) return;

      const rosterUrl = `https://stats.nba.com/stats/commonteamroster?LeagueID=00&Season=${season}&TeamID=${teamId}`;
      const rosterResult = await fetchJson<{
        resultSets: { headers: string[]; rowSet: unknown[][] }[];
      }>(rosterUrl, { headers: NBA_HEADERS }, NBA_ROSTER_TIMEOUT_MS);

      if (!rosterResult.ok || !rosterResult.data) return;

      const rs = rosterResult.data.resultSets[0];
      if (!rs?.rowSet?.length) return;

      const rh = rs.headers;
      const nameIdx =
        rh.indexOf("PLAYER") >= 0
          ? rh.indexOf("PLAYER")
          : rh.indexOf("PLAYER_NAME");
      if (nameIdx < 0) return;

      for (const r of rs.rowSet) {
        const name = String(r[nameIdx]).trim();
        if (name) players.push({ player: name, team: abbrev.toUpperCase() });
      }
    })
  );

  return dedupePlayers(players);
}

/** Single request; filter to tonight's teams */
async function fetchRosterViaCommonAllPlayers(
  abbrevs: string[]
): Promise<TonightPlayer[]> {
  const season = seasonLabel();
  const url = `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${season}&IsOnlyCurrentSeason=1`;
  const result = await fetchJson<{
    resultSets: { headers: string[]; rowSet: unknown[][] }[];
  }>(url, { headers: NBA_HEADERS }, NBA_ROSTER_TIMEOUT_MS);

  if (!result.ok || !result.data) return [];

  const rs = result.data.resultSets[0];
  if (!rs?.rowSet?.length) return [];

  const h = rs.headers;
  const nameIdx = h.indexOf("DISPLAY_FIRST_LAST");
  const teamIdx = h.indexOf("TEAM_ABBREVIATION");
  if (nameIdx < 0 || teamIdx < 0) return [];

  const wanted = new Set(abbrevs.map((a) => a.toUpperCase()));
  const players: TonightPlayer[] = [];

  for (const row of rs.rowSet) {
    const team = String(row[teamIdx]).toUpperCase();
    if (!wanted.has(team)) continue;
    const name = String(row[nameIdx]).trim();
    if (name) players.push({ player: name, team });
  }

  return dedupePlayers(players);
}

/** Update only game status labels; keep cached rosters. */
async function refreshGameStatuses(
  slate: TonightSlate,
  gamesOnly = false
): Promise<TonightSlate> {
  const espn = await getSlateFromEspn(slate.date, true);
  if (espn.games.length > 0) {
    return {
      ...slate,
      games: espn.games,
      source: "espn",
      // keep existing rosters if already loaded
      players: gamesOnly
        ? []
        : slate.players.length
          ? slate.players
          : espn.players,
      rosterSource: gamesOnly
        ? "none"
        : slate.players.length
          ? slate.rosterSource
          : espn.rosterSource,
      teamIds: gamesOnly
        ? []
        : slate.teamIds.length
          ? slate.teamIds
          : espn.teamIds,
    };
  }

  if (hasBdlKey()) {
    const gamesResult = await fetchJson<{ data: BdlGame[] }>(
      `${BDL_BASE}/games?dates[]=${slate.date}&per_page=100`,
      { headers: bdlHeaders() },
      8_000
    );
    if (gamesResult.ok && gamesResult.data?.data?.length) {
      const nextGames: TonightGame[] = gamesResult.data.data
        .filter((g) => normalizeBdlGameDate(g) === slate.date)
        .map((g) => ({
          home: canonicalTeamAbbrev(g.home_team.abbreviation),
          away: canonicalTeamAbbrev(g.visitor_team.abbreviation),
          status: formatGameTimeLabel({
            datetimeUtc: g.datetime,
            statusText: g.status,
          }),
          postseason: g.postseason,
        }));
      if (nextGames.length) {
        return { ...slate, games: nextGames, source: "balldontlie" };
      }
    }
  }

  const scoreboard = await fetchNbaScoreboard(slate.date);
  if (scoreboard.games.length === 0) return slate;
  return { ...slate, games: scoreboard.games, source: "nba" };
}

async function fetchNbaScoreboard(date: string): Promise<{
  games: TonightGame[];
  teamIds: number[];
}> {
  const [year, month, day] = date.split("-");
  const gameDate = `${month}/${day}/${year}`;

  const url = `https://stats.nba.com/stats/scoreboardv2?GameDate=${gameDate}&LeagueID=00&DayOffset=0`;
  const result = await fetchJson<{
    resultSets: { name: string; headers: string[]; rowSet: unknown[][] }[];
  }>(url, { headers: NBA_HEADERS }, 12_000);

  if (!result.ok || !result.data) {
    return { games: [], teamIds: [] };
  }

  const gameHeader = result.data.resultSets.find(
    (rs) => rs.name === "GameHeader"
  );
  if (!gameHeader?.rowSet?.length) {
    return { games: [], teamIds: [] };
  }

  const h = gameHeader.headers;
  const col = (name: string) => h.indexOf(name);

  const teamIds: number[] = [];
  const games: TonightGame[] = [];

  for (const row of gameHeader.rowSet) {
    const homeId = row[col("HOME_TEAM_ID")] as number;
    const awayId = row[col("VISITOR_TEAM_ID")] as number;
    teamIds.push(homeId, awayId);

    const statusText = String(row[col("GAME_STATUS_TEXT")] ?? "");
    games.push({
      home: String(row[col("HOME_TEAM_ABBREVIATION")]),
      away: String(row[col("VISITOR_TEAM_ABBREVIATION")]),
      status: formatGameTimeLabel({ statusText }),
      postseason: false,
      homeTeamId: homeId,
      awayTeamId: awayId,
    });
  }

  return { games, teamIds: [...new Set(teamIds)] };
}

function emptySlate(
  date: string,
  source: TonightSlate["source"]
): TonightSlate {
  return {
    date,
    games: [],
    players: [],
    teamIds: [],
    source,
    rosterSource: "none",
  };
}

function dedupePlayers(players: TonightPlayer[]): TonightPlayer[] {
  const seen = new Set<string>();
  return players.filter((p) => {
    const key = `${p.player}|${p.team}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getTonightPlayers(): Promise<TonightPlayer[]> {
  const slate = await getTonightSlate();
  return slate.players;
}
