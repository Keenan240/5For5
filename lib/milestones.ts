import type { GameLog, StatCategory } from "./types";

export const STAT_KEY: Record<StatCategory, keyof GameLog> = {
  Points: "pts",
  Rebounds: "reb",
  Assists: "ast",
  "3-Pointers": "fg3m",
  Steals: "stl",
  Blocks: "blk",
};

export const LADDERS: Record<StatCategory, number[]> = {
  Points: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
  Rebounds: [4, 6, 8, 10, 12, 14, 16],
  Assists: [2, 4, 6, 8, 10, 12, 14],
  "3-Pointers": [1, 2, 3, 4, 5, 6, 7],
  Steals: [1, 2, 3, 4, 5],
  Blocks: [1, 2, 3, 4, 5],
};

export const STAT_CATEGORIES: StatCategory[] = [
  "Points",
  "Rebounds",
  "Assists",
  "3-Pointers",
  "Steals",
  "Blocks",
];

/** Strict 5/5: every value must be >= threshold */
export function qualifiesForMilestone(values: number[], threshold: number): boolean {
  return values.length === 5 && values.every((v) => v >= threshold);
}

/** Walk ladder upward; stop at first failure; return highest passing threshold */
export function discoverMilestone(values: number[], ladder: number[]): number | null {
  if (values.length < 5) return null;
  const l5Average = values.reduce((a, b) => a + b, 0) / values.length;
  const dynamicFloor = l5Average * 0.5;
  const eligibleLadder = ladder.filter((t) => t >= dynamicFloor);
  if (eligibleLadder.length === 0) return null;

  let best: number | null = null;
  for (const t of eligibleLadder) {
    if (qualifiesForMilestone(values, t)) best = t;
    else break;
  }
  return best;
}

export function averageBuffer(values: number[], threshold: number): number {
  const margins = values.map((v) => v - threshold);
  return margins.reduce((a, b) => a + b, 0) / values.length;
}

export function extractStatValues(logs: GameLog[], stat: StatCategory): number[] {
  const key = STAT_KEY[stat];
  return logs.map((l) => l[key] as number);
}

export function formatMilestoneLabel(stat: StatCategory, threshold: number): string {
  const abbrev: Record<StatCategory, string> = {
    Points: "PTS",
    Rebounds: "REB",
    Assists: "AST",
    "3-Pointers": "3PM",
    Steals: "STL",
    Blocks: "BLK",
  };
  return `${threshold}+ ${abbrev[stat]}`;
}
