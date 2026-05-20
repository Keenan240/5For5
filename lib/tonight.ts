import { fetchJson } from "./fetch";
import { bdlHeaders, hasBdlKey, nbaSeasonYear } from "./bdl-client";
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
  source: "balldontlie" | "nba";
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

let slateCache: { key: string; slate: TonightSlate; at: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export function getTodayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function seasonLabel(): string {
  const y = nbaSeasonYear();
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

export async function getSlateForDate(
  date: string,
  opts?: { fresh?: boolean }
): Promise<TonightSlate> {
  const cacheKey = `${date}-v4`;

  if (
    !opts?.fresh &&
    slateCache &&
    slateCache.key === cacheKey &&
    Date.now() - slateCache.at < CACHE_MS
  ) {
    return slateCache.slate;
  }

  let slate: TonightSlate;

  if (hasBdlKey()) {
    slate = await getSlateFromBdl(date);
    if (slate.games.length > 0) {
      slateCache = { key: cacheKey, slate, at: Date.now() };
      return slate;
    }
  }

  slate = await getSlateFromNba(date);
  slateCache = { key: cacheKey, slate, at: Date.now() };
  return slate;
}

export async function getTonightSlate(): Promise<TonightSlate> {
  return getSlateForDate(getTodayEastern());
}

/** Games from BallDontLie; rosters via NBA team endpoints (not scoreboard) */
async function getSlateFromBdl(date: string): Promise<TonightSlate> {
  const season = nbaSeasonYear();
  const gamesResult = await fetchJson<{ data: BdlGame[] }>(
    `${BDL_BASE}/games?dates[]=${date}&seasons[]=${season}&per_page=100`,
    { headers: bdlHeaders() }
  );

  const games = gamesResult.data?.data ?? [];
  if (games.length === 0) {
    return emptySlate(date, "balldontlie");
  }

  const slateGames: TonightGame[] = games.map((g) => ({
    home: g.home_team.abbreviation,
    away: g.visitor_team.abbreviation,
    status: formatGameTimeLabel({
      datetimeUtc: g.datetime,
      statusText: g.status,
    }),
    postseason: g.postseason,
  }));

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

async function getSlateFromNba(date: string): Promise<TonightSlate> {
  const scoreboard = await fetchNbaScoreboard(date);
  const abbrevs =
    scoreboard.games.length > 0
      ? uniqueAbbrevs(scoreboard.games)
      : [];

  const { players, rosterSource, teamIds } =
    abbrevs.length > 0
      ? await resolveRostersForTeams(abbrevs)
      : { players: [], rosterSource: "none" as const, teamIds: [] };

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

  const byEspn = await fetchRostersFromEspn(abbrevs);
  if (byEspn.length > 0) {
    return { players: byEspn, rosterSource: "espn", teamIds };
  }

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

async function fetchNbaScoreboard(date: string): Promise<{
  games: TonightGame[];
  teamIds: number[];
}> {
  const [year, month, day] = date.split("-");
  const gameDate = `${month}/${day}/${year}`;

  const url = `https://stats.nba.com/stats/scoreboardv2?GameDate=${gameDate}&LeagueID=00&DayOffset=0`;
  const result = await fetchJson<{
    resultSets: { name: string; headers: string[]; rowSet: unknown[][] }[];
  }>(url, { headers: NBA_HEADERS }, NBA_ROSTER_TIMEOUT_MS);

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
