export type StatCategory =
  | "Points"
  | "Rebounds"
  | "Assists"
  | "3-Pointers"
  | "Steals"
  | "Blocks";

export type ParlayLeg = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  odds: number;
  hitRate: string;
  last5: number[];
  buffer: number;
  minutes?: number[];
};

export type RankedPoolPick = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  rank: number;
  inParlay: boolean;
};

export type SettledRankedPick = RankedPoolPick & {
  actualValue: number;
  hit: boolean;
};

export type PendingParlay = {
  date: string;
  stake: number;
  legs: ParlayLeg[];
  parlayOdds: number;
  potentialPayout: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** Full discovery ranking at place time — used to settle alternates in history. */
  rankedPool?: RankedPoolPick[];
};

export type SettledLeg = ParlayLeg & {
  actualValue: number;
  hit: boolean;
};

export type SettledParlay = {
  date: string;
  stake: number;
  legs: SettledLeg[];
  parlayOdds: number;
  result: "win" | "loss";
  payout: number;
  profit: number;
  bankrollAfter: number;
  failureAnalysis?: string;
  /** Full ranked pool frozen at place time (for honest history alternates). */
  rankedPool?: RankedPoolPick[];
  /** Outcomes for the full ranked pool (if saved at settle / backfill). */
  rankedResults?: SettledRankedPick[];
};

export type ParlayDraft = {
  date: string;
  legs: ParlayLeg[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export type ParlayState = {
  bankroll: number;
  pending: PendingParlay | null;
  history: SettledParlay[];
};

export type SeasonType = "Regular Season" | "Playoffs";

export type GameLog = {
  date: string;
  opponent: string;
  seasonType?: SeasonType;
  pts: number;
  reb: number;
  ast: number;
  fg3m: number;
  stl: number;
  blk: number;
  min: number;
};

export type QualifiedCandidate = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  last5: number[];
  buffer: number;
  odds: number;
  score: number;
};
