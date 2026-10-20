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

  let best: number | null = null;
  for (const t of ladder) {
    if (qualifiesForMilestone(values, t)) best = t;
    else break;
  }
  return best;
}

/**
 * All ladder rungs at or below the highest 5/5 line (e.g. 15+ → also 5+, 10+).
 * Lower lines always qualify if the higher one does.
 */
export function thresholdsAtOrBelow(
  highest: number,
  ladder: number[]
): number[] {
  return ladder.filter((t) => t <= highest);
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

/** Ladder index for a threshold (nearest at-or-below if not exact). */
export function ladderIndex(stat: string, threshold: number): number {
  const ladder = LADDERS[stat as StatCategory];
  if (!ladder?.length) return 0;
  const exact = ladder.indexOf(threshold);
  if (exact >= 0) return exact;
  let nearest = 0;
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i]! <= threshold) nearest = i;
  }
  return nearest;
}

/** 0 = floor rung, 1 = top of ladder. */
export function ladderFraction(stat: string, threshold: number): number {
  const ladder = LADDERS[stat as StatCategory];
  if (!ladder || ladder.length <= 1) return 0;
  return ladderIndex(stat, threshold) / (ladder.length - 1);
}

/**
 * How “close” a last-5 value is to the leg line (for color coding).
 * Tuned to typical ladder step size per category.
 */
export const LAST5_NEAR_MARGIN: Record<StatCategory, number> = {
  Points: 3, // 15 → 16–18 yellow, 19+ green
  Rebounds: 2,
  Assists: 2,
  "3-Pointers": 1,
  Steals: 1,
  Blocks: 1,
};

export type Last5Tone = "danger" | "warn" | "safe";

/** Red = at/under line, yellow = thin cushion, green = comfortable. */
export function last5ValueTone(
  value: number,
  threshold: number,
  stat: StatCategory
): Last5Tone {
  const margin = value - threshold;
  if (margin <= 0) return "danger";
  if (margin <= LAST5_NEAR_MARGIN[stat]) return "warn";
  return "safe";
}
