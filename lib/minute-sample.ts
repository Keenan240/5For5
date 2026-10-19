import type { GameLog } from "./types";

/** Never count games below this many minutes (DNP / garbage sample). */
const ABSOLUTE_MIN_MINUTES = 10;

/**
 * Games at or above this many minutes are used to estimate "typical" load
 * for the reliability floor (so one 7-min ejection does not drag the average down).
 */
const BASELINE_MIN_MINUTES = 10;

/**
 * Need at least this many "substantial" games to trust baseline-only average;
 * otherwise fall back to full-log mean.
 */
const BASELINE_MIN_COUNT = 3;

/**
 * Game must reach at least this fraction of the player's baseline minutes
 * (injury, ejection, blowout sit — e.g. Wemby 7 min vs ~26 typical).
 */
const FRACTION_OF_AVG = 0.5;

/** If strict filter leaves too few games, relax toward these floors (in order). */
const RELAX_FLOORS: { abs: number; frac: number }[] = [
  { abs: 8, frac: 0.42 },
  { abs: 6, frac: 0.35 },
];

const MIN_MEANINGFUL_MINUTES = 1;

export function meanMinutes(logs: GameLog[]): number {
  if (logs.length === 0) return 0;
  let sum = 0;
  for (const g of logs) sum += g.min;
  return sum / logs.length;
}

/** Average minutes using games that look like real run (excludes ejections from baseline). */
export function meanMinutesForBaseline(logs: GameLog[]): number {
  const substantial = logs.filter((g) => g.min >= BASELINE_MIN_MINUTES);
  if (substantial.length >= BASELINE_MIN_COUNT) {
    return meanMinutes(substantial);
  }
  return meanMinutes(logs);
}

/** Minutes required for a game to count toward "recent" sample windows. */
export function minuteReliabilityFloor(avgMinutes: number): number {
  if (avgMinutes <= 0) return ABSOLUTE_MIN_MINUTES;
  return Math.max(ABSOLUTE_MIN_MINUTES, FRACTION_OF_AVG * avgMinutes);
}

function floorRelaxed(
  baselineAvg: number,
  absMin: number,
  frac: number
): number {
  if (baselineAvg <= 0) return absMin;
  return Math.max(absMin, frac * baselineAvg);
}

/**
 * Drop games where the player barely played vs their usual load.
 * `logs` should be newest-first (same order as NBA/merged gamelog).
 * If the strict rule leaves fewer than 5 games, relaxes thresholds so stars
 * still produce a valid L5 window whenever possible.
 */
export function filterReliableMinuteGamesNewestFirst(logs: GameLog[]): GameLog[] {
  if (logs.length === 0) return [];
  if (logs.length <= 5) return logs;

  const baseline = meanMinutesForBaseline(logs);

  const tryFloor = (floor: number) =>
    logs.filter((g) => g.min >= floor);

  let floor = minuteReliabilityFloor(baseline);
  let filtered = tryFloor(floor);

  if (filtered.length >= 5) return filtered;

  for (const step of RELAX_FLOORS) {
    floor = floorRelaxed(baseline, step.abs, step.frac);
    filtered = tryFloor(floor);
    if (filtered.length >= 5) return filtered;
  }

  filtered = tryFloor(MIN_MEANINGFUL_MINUTES);
  if (filtered.length >= 5) return filtered;

  // Bad minute data (many zeros): do not block discovery entirely.
  const suspicious =
    logs.length > 0 &&
    logs.filter((g) => g.min <= 0).length / logs.length > 0.4;
  if (suspicious) return logs;

  return logs;
}
