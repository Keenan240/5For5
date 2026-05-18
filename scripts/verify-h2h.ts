/**
 * H2H logic checks (run: npx tsx scripts/verify-h2h.ts)
 */
import assert from "node:assert/strict";
import { normalizeGameLogDate } from "../lib/dates";
import {
  gamesVsOpponent,
  isGameVsOpponent,
  passesH2hVetoVsOpponent,
} from "../lib/h2h";
import { discoverMilestone, extractStatValues, LADDERS } from "../lib/milestones";
import type { GameLog } from "../lib/types";

let dateSeq = 0;
function log(
  pts: number,
  opp: string,
  seasonType: "Regular Season" | "Playoffs" = "Regular Season",
  min = 30
): GameLog {
  dateSeq += 1;
  return {
    date: `2026-05-${String(dateSeq).padStart(2, "0")}`,
    opponent: `SAS vs. ${opp}`,
    seasonType,
    pts,
    reb: 0,
    ast: 0,
    fg3m: 0,
    stl: 0,
    blk: 0,
    min,
  };
}

dateSeq = 0;
const earlyOverall: GameLog[] = [
  log(22, "LAL"),
  log(18, "DAL"),
  log(14, "PHX"),
  log(20, "DEN"),
  log(19, "MEM"),
];
const earlyVals = extractStatValues(earlyOverall, "Points");
assert.equal(discoverMilestone(earlyVals, LADDERS.Points), 10);
assert.notEqual(discoverMilestone(earlyVals, LADDERS.Points), 15);

dateSeq = 0;
const goodOverall: GameLog[] = [
  log(22, "LAL"),
  log(18, "DAL"),
  log(16, "PHX"),
  log(20, "DEN"),
  log(19, "MEM"),
];
const goodVals = extractStatValues(goodOverall, "Points");
assert.equal(discoverMilestone(goodVals, LADDERS.Points), 15);

// Veto: any vs-opponent game below the line disqualifies that milestone.
const vsOkcWeak: GameLog[] = [
  {
    date: "2026-06-01",
    opponent: "SAS vs. OKC",
    seasonType: "Regular Season",
    pts: 8,
    reb: 0,
    ast: 0,
    fg3m: 0,
    stl: 0,
    blk: 0,
    min: 30,
  },
];
assert.equal(passesH2hVetoVsOpponent([], "Points", 10), true);
assert.equal(passesH2hVetoVsOpponent(vsOkcWeak, "Points", 10), false);
assert.equal(passesH2hVetoVsOpponent(vsOkcWeak, "Points", 5), true);

// L5 supports 20+ PTS but an older vs-OKC game at 19 vetoes the 20+ line only.
const newestFirstFull: GameLog[] = [
  { date: "2026-06-30", opponent: "SAS vs. LAL", seasonType: "Regular Season", pts: 22, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, min: 32 },
  { date: "2026-06-29", opponent: "SAS @ DAL", seasonType: "Regular Season", pts: 22, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, min: 32 },
  { date: "2026-06-28", opponent: "SAS vs. PHX", seasonType: "Regular Season", pts: 22, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, min: 32 },
  { date: "2026-06-27", opponent: "SAS @ DEN", seasonType: "Regular Season", pts: 22, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, min: 32 },
  { date: "2026-06-26", opponent: "SAS vs. MEM", seasonType: "Regular Season", pts: 22, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, min: 32 },
  {
    date: "2026-06-01",
    opponent: "SAS @ OKC",
    seasonType: "Playoffs",
    pts: 19,
    reb: 0,
    ast: 0,
    fg3m: 0,
    stl: 0,
    blk: 0,
    min: 32,
  },
];
const l5Chronological = newestFirstFull.slice(0, 5).reverse();
const vsOpp = gamesVsOpponent(newestFirstFull, "SAS", "OKC");
assert.equal(vsOpp.length, 1);
const l5Vals = extractStatValues(l5Chronological, "Points");
const t20 = discoverMilestone(l5Vals, LADDERS.Points);
assert.equal(t20, 20);
assert.equal(passesH2hVetoVsOpponent(vsOpp, "Points", 20), false);
assert.equal(passesH2hVetoVsOpponent(vsOpp, "Points", 15), true);

assert(
  isGameVsOpponent(
    {
      date: "2025-12-25",
      opponent: "SAS @ OKC",
      seasonType: "Regular Season",
      pts: 20,
      reb: 0,
      ast: 0,
      fg3m: 0,
      stl: 0,
      blk: 0,
      min: 30,
    },
    "OKC",
    "SA"
  )
);

assert.equal(normalizeGameLogDate("APR 10, 2025"), "2025-04-10");
assert.equal(
  normalizeGameLogDate("2025-12-25T19:30:00.000+00:00"),
  "2025-12-25"
);

console.log("verify-h2h: all assertions passed");
