import { normalizeGameLogDate } from "./dates";
import { STAT_KEY } from "./milestones";
import type { GameLog, StatCategory } from "./types";

/** ESPN / legacy tricodes → NBA stats tricode (for H2H matching). */
const TEAM_ABBREV_ALIASES: Record<string, string> = {
  SA: "SAS",
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  PHO: "PHX",
  UTAH: "UTA",
};

export function canonicalTeamAbbrev(abbrev: string): string {
  const u = abbrev.toUpperCase().trim();
  return TEAM_ABBREV_ALIASES[u] ?? u;
}

export function parseTeamsFromMatchup(matchup: string): string[] {
  const found = matchup.toUpperCase().match(/\b[A-Z]{2,3}\b/g);
  if (!found?.length) return [];
  return [...new Set(found.map(canonicalTeamAbbrev))];
}

export function looksLikeMatchup(opponentField: string): boolean {
  const u = opponentField.toUpperCase();
  if (/\b[A-Z]{2,3}\s+(VS\.?|@)\s+[A-Z]{2,3}\b/.test(u)) return true;
  return parseTeamsFromMatchup(u).length >= 2;
}

export function opponentFromMatchup(
  matchup: string,
  playerTeam: string
): string | null {
  const teams = parseTeamsFromMatchup(matchup);
  const pt = canonicalTeamAbbrev(playerTeam);
  const other = teams.find((t) => canonicalTeamAbbrev(t) !== pt);
  return other ?? null;
}

const ESPN_NAME_TO_ABBREV: Record<string, string> = {
  "atlanta hawks": "ATL",
  "boston celtics": "BOS",
  "brooklyn nets": "BKN",
  "charlotte hornets": "CHA",
  "chicago bulls": "CHI",
  "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL",
  "denver nuggets": "DEN",
  "detroit pistons": "DET",
  "golden state warriors": "GSW",
  "houston rockets": "HOU",
  "indiana pacers": "IND",
  "la clippers": "LAC",
  "los angeles clippers": "LAC",
  "la lakers": "LAL",
  "los angeles lakers": "LAL",
  "memphis grizzlies": "MEM",
  "miami heat": "MIA",
  "milwaukee bucks": "MIL",
  "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP",
  "new york knicks": "NYK",
  "oklahoma city thunder": "OKC",
  "orlando magic": "ORL",
  "philadelphia 76ers": "PHI",
  "phoenix suns": "PHX",
  "portland trail blazers": "POR",
  "sacramento kings": "SAC",
  "san antonio spurs": "SAS",
  "toronto raptors": "TOR",
  "utah jazz": "UTA",
  "washington wizards": "WAS",
};

export function normalizeOpponentAbbrev(
  opponentField: string,
  expectedAbbrev?: string
): string | null {
  const u = opponentField.toUpperCase().trim();
  if (/^[A-Z]{3}$/.test(u)) return u;

  const parsed = parseTeamsFromMatchup(u);
  if (expectedAbbrev) {
    const hit = parsed.find((t) => t === expectedAbbrev.toUpperCase());
    if (hit) return hit;
  }
  if (parsed.length === 1) return parsed[0];

  const lower = opponentField.toLowerCase().trim();
  for (const [name, abbr] of Object.entries(ESPN_NAME_TO_ABBREV)) {
    if (lower.includes(name) || name.includes(lower)) return abbr;
  }
  if (expectedAbbrev && u.includes(expectedAbbrev)) return expectedAbbrev.toUpperCase();

  return parsed[0] ?? null;
}

export function isGameVsOpponent(
  log: GameLog,
  opponentAbbrev: string,
  playerTeam: string
): boolean {
  const opp = opponentAbbrev.toUpperCase();
  const fromMatchup = opponentFromMatchup(log.opponent, playerTeam);
  if (fromMatchup === opp) return true;
  const norm = normalizeOpponentAbbrev(log.opponent, opp);
  return norm === opp;
}

function dedupeByDate(logs: GameLog[]): GameLog[] {
  const seen = new Set<string>();
  const out: GameLog[] = [];
  for (const g of logs) {
    const key = normalizeGameLogDate(g.date);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Deduped by date, newest-first order preserved from `allLogsNewestFirst`. */
export function gamesVsOpponent(
  allLogsNewestFirst: GameLog[],
  playerTeam: string,
  opponentAbbrev: string
): GameLog[] {
  const deduped = dedupeByDate(allLogsNewestFirst);
  const opp = opponentAbbrev.toUpperCase();
  return deduped.filter((g) => isGameVsOpponent(g, opp, playerTeam));
}

/** Newest-first logs split by playoff vs reg for this opponent. */
export function splitVsOpponent(
  allLogsNewestFirst: GameLog[],
  playerTeam: string,
  opponentAbbrev: string
): { series: GameLog[]; prior: GameLog[] } {
  const vs = allLogsNewestFirst.filter((g) =>
    isGameVsOpponent(g, opponentAbbrev, playerTeam)
  );
  const series: GameLog[] = [];
  const prior: GameLog[] = [];
  for (const g of vs) {
    if (g.seasonType === "Playoffs") series.push(g);
    else prior.push(g);
  }
  return { series, prior };
}

/**
 * H2H veto: if there is any prior game vs tonight's opponent, every such game
 * must be >= the milestone line. No vs-opponent history → no veto.
 */
export function passesH2hVetoVsOpponent(
  vsOpponentGames: GameLog[],
  stat: StatCategory,
  threshold: number
): boolean {
  if (vsOpponentGames.length === 0) return true;
  const key = STAT_KEY[stat];
  for (const g of vsOpponentGames) {
    if ((g[key] as number) < threshold) return false;
  }
  return true;
}

export function formatH2hVetoLine(
  vsOpponentGames: GameLog[],
  stat: StatCategory,
  threshold: number
): string {
  if (vsOpponentGames.length === 0) return "no prior vs opponent";
  const key = STAT_KEY[stat];
  const vals = vsOpponentGames.map((g) => g[key] as number);
  const hits = vals.filter((v) => v >= threshold).length;
  return `${hits}/${vals.length} vs opp ≥ line (${vals.join(",")})`;
}
