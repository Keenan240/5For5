import {
  discoverMilestone,
  extractStatValues,
  qualifiesForMilestone,
  LADDERS,
  STAT_KEY,
} from "./milestones";
import type { GameLog, StatCategory } from "./types";

export type H2hTier = "early" | "blend" | "series";

export type H2hWeightedGame = {
  log: GameLog;
  weight: number;
  source: "series" | "prior" | "overall";
};

export type H2hEvaluation = {
  tier: H2hTier;
  opponent: string;
  seriesGamesPlayed: number;
  /** Exactly 5 games used for milestone ladder (chronological: oldest → newest). */
  milestoneWindow: GameLog[];
  /** Up to 3 games for rank adjustment vs opponent. */
  h2hSample: H2hWeightedGame[];
  /** 0–1: how much H2H factor moves the final score. */
  h2hEmphasis: number;
  gateLabel: string;
};

const MILESTONE_GAMES = 5;
const H2H_SAMPLE_MAX = 3;

/** Tier: 0–1 early, 2–4 blend (Game 3+ emphasis), 5+ series-only gate. */
export function tierForSeriesCount(seriesGamesPlayed: number): H2hTier {
  if (seriesGamesPlayed >= 5) return "series";
  if (seriesGamesPlayed >= 2) return "blend";
  return "early";
}

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
    const key = g.date.slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
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

function padMilestoneWindow(
  primary: GameLog[],
  fillFrom: GameLog[],
  size: number = MILESTONE_GAMES
): GameLog[] {
  const used = new Set(primary.map((g) => g.date.slice(0, 10)));
  const out = [...primary];
  for (const g of fillFrom) {
    if (out.length >= size) break;
    const key = g.date.slice(0, 10);
    if (used.has(key)) continue;
    used.add(key);
    out.push(g);
  }
  return out.slice(0, size);
}

/** Oldest → newest for milestone ladder. */
function chronological(logs: GameLog[]): GameLog[] {
  return [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function buildH2hSample(
  series: GameLog[],
  prior: GameLog[],
  tier: H2hTier,
  seriesGamesPlayed: number
): H2hWeightedGame[] {
  const combined: H2hWeightedGame[] = [];

  for (const log of series.slice(0, H2H_SAMPLE_MAX)) {
    combined.push({ log, weight: 1, source: "series" });
  }

  if (combined.length < H2H_SAMPLE_MAX) {
    const priorWeight =
      tier === "blend" ? Math.min(0.5, 0.25 + 0.1 * seriesGamesPlayed) : 0.35;
    for (const log of prior) {
      if (combined.length >= H2H_SAMPLE_MAX) break;
      combined.push({ log, weight: priorWeight, source: "prior" });
    }
  }

  return combined.slice(0, H2H_SAMPLE_MAX);
}

/** H2H emphasis ramps from Game 3 (2 series GP): stronger rank pull vs opponent. */
export function h2hEmphasisForTier(
  tier: H2hTier,
  seriesGamesPlayed: number
): number {
  if (tier === "series") return 1;
  if (tier === "blend") {
    return Math.min(0.95, 0.6 + 0.12 * (seriesGamesPlayed - 2));
  }
  return seriesGamesPlayed >= 1 ? 0.45 : 0.35;
}

export function h2hFactorForThreshold(
  sample: H2hWeightedGame[],
  stat: StatCategory,
  threshold: number
): number {
  if (sample.length === 0) return 1;

  const key = STAT_KEY[stat];
  let hitW = 0;
  let totalW = 0;
  for (const { log, weight } of sample) {
    const v = log[key] as number;
    totalW += weight;
    if (v >= threshold) hitW += weight;
  }
  if (totalW <= 0) return 1;

  const rate = hitW / totalW;
  return 0.75 + 0.25 * rate;
}

export function applyH2hToScore(
  baseScore: number,
  h2hFactor: number,
  emphasis: number
): number {
  return baseScore * (1 - emphasis + emphasis * h2hFactor);
}

/**
 * Build milestone + H2H context for a player facing `opponentAbbrev` tonight.
 * `allLogsNewestFirst` = full season log, newest first.
 */
export function buildH2hEvaluation(
  allLogsNewestFirst: GameLog[],
  playerTeam: string,
  opponentAbbrev: string
): H2hEvaluation | null {
  const opponent = opponentAbbrev.toUpperCase();
  const overallNewest = dedupeByDate(allLogsNewestFirst);
  if (overallNewest.length < MILESTONE_GAMES) return null;

  const overallFive = overallNewest.slice(0, MILESTONE_GAMES);
  const { series, prior } = splitVsOpponent(
    overallNewest,
    playerTeam,
    opponent
  );
  const seriesGamesPlayed = series.length;
  const tier = tierForSeriesCount(seriesGamesPlayed);

  let milestoneWindow: GameLog[];
  let gateLabel: string;

  if (tier === "series") {
    if (series.length < MILESTONE_GAMES) return null;
    milestoneWindow = chronological(series.slice(0, MILESTONE_GAMES));
    gateLabel = `series 5/5 vs ${opponent}`;
  } else if (tier === "blend") {
    const seriesChunk = series.slice(0, seriesGamesPlayed);
    const padded = padMilestoneWindow(seriesChunk, overallNewest, MILESTONE_GAMES);
    if (padded.length < MILESTONE_GAMES) return null;
    milestoneWindow = chronological(padded);
    gateLabel = `blend 5/5 (${seriesGamesPlayed} series + overall) vs ${opponent}`;
  } else {
    milestoneWindow = chronological(overallFive);
    gateLabel = `L5 5/5 overall · H2H vs ${opponent}`;
  }

  const h2hSample = buildH2hSample(series, prior, tier, seriesGamesPlayed);
  const h2hEmphasis = h2hEmphasisForTier(tier, seriesGamesPlayed);

  return {
    tier,
    opponent,
    seriesGamesPlayed,
    milestoneWindow,
    h2hSample,
    h2hEmphasis,
    gateLabel,
  };
}

/** Strict milestone on the tier window — every game must be >= threshold. */
export function discoverMilestoneOnWindow(
  windowChronological: GameLog[],
  stat: StatCategory
): { threshold: number | null; values: number[] } {
  if (windowChronological.length !== MILESTONE_GAMES) {
    return { threshold: null, values: [] };
  }
  const values = extractStatValues(windowChronological, stat);
  const threshold = discoverMilestone(values, LADDERS[stat]);
  if (threshold === null) return { threshold: null, values };
  if (!qualifiesForMilestone(values, threshold)) {
    return { threshold: null, values };
  }
  return { threshold, values };
}

export function formatH2hSampleLine(
  sample: H2hWeightedGame[],
  stat: StatCategory,
  threshold: number
): string {
  if (sample.length === 0) return "no H2H";
  const key = STAT_KEY[stat];
  let hits = 0;
  const vals: number[] = [];
  for (const { log } of sample) {
    const v = log[key] as number;
    vals.push(v);
    if (v >= threshold) hits++;
  }
  return `${hits}/${sample.length} (${vals.join(",")})`;
}
