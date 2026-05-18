/**
 * Quick H2H logic checks (run: npx tsx scripts/verify-h2h.ts)
 */
import assert from "node:assert/strict";
import {
  buildH2hEvaluation,
  discoverMilestoneOnWindow,
  isGameVsOpponent,
  tierForSeriesCount,
} from "../lib/h2h";
import type { GameLog } from "../lib/types";

let dateSeq = 0;
function log(
  pts: number,
  opp: string,
  seasonType: "Regular Season" | "Playoffs" = "Regular Season"
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
    min: 30,
  };
}

dateSeq = 0;
// Strict 5/5: 14 in window must NOT qualify for 15+ PTS
const earlyOverall: GameLog[] = [
  log(22, "LAL"),
  log(18, "DAL"),
  log(14, "PHX"),
  log(20, "DEN"),
  log(19, "MEM"),
];
const earlyEval = buildH2hEvaluation(earlyOverall, "SAS", "OKC");
assert(earlyEval);
const bad15 = discoverMilestoneOnWindow(earlyEval.milestoneWindow, "Points");
assert.notEqual(bad15.threshold, 15, "14 in L5 blocks 15+ PTS");
assert.equal(bad15.threshold, 10, "10+ still passes strict 5/5");

dateSeq = 0;
const goodOverall: GameLog[] = [
  log(22, "LAL"),
  log(18, "DAL"),
  log(16, "PHX"),
  log(20, "DEN"),
  log(19, "MEM"),
];
const goodEval = buildH2hEvaluation(goodOverall, "SAS", "OKC");
assert(goodEval);
const ok15 = discoverMilestoneOnWindow(goodEval.milestoneWindow, "Points");
assert.equal(ok15.threshold, 15);

// Game 3 emphasis: 2 series games → blend tier
assert.equal(tierForSeriesCount(2), "blend");

dateSeq = 0;
const game3Logs: GameLog[] = [
  log(18, "OKC", "Playoffs"),
  log(14, "OKC", "Playoffs"),
  log(22, "LAL"),
  log(20, "DAL"),
  log(19, "MEM"),
  log(17, "PHX"),
];
const blendEval = buildH2hEvaluation(game3Logs, "SAS", "OKC");
assert(blendEval);
assert.equal(blendEval.tier, "blend");
assert.equal(blendEval.seriesGamesPlayed, 2);
assert(blendEval.h2hEmphasis >= 0.6, "Game 3+ should emphasize H2H");

// Series tier: 5 playoff vs OKC
dateSeq = 0;
const seriesLogs: GameLog[] = [];
for (let i = 0; i < 5; i++) {
  seriesLogs.push(log(16 + i, "OKC", "Playoffs"));
}
for (let i = 0; i < 5; i++) {
  seriesLogs.push(log(25, "LAL"));
}
const seriesEval = buildH2hEvaluation(seriesLogs, "SAS", "OKC");
assert(seriesEval);
assert.equal(seriesEval.tier, "series");

dateSeq = 0;
const slumpSeries: GameLog[] = [
  log(19, "OKC", "Playoffs"),
  log(16, "OKC", "Playoffs"),
  log(12, "OKC", "Playoffs"),
  log(18, "OKC", "Playoffs"),
  log(17, "OKC", "Playoffs"),
  ...goodOverall,
];
const slumpEval = buildH2hEvaluation(slumpSeries, "SAS", "OKC");
assert(slumpEval);
const slump15 = discoverMilestoneOnWindow(slumpEval.milestoneWindow, "Points");
assert.notEqual(slump15.threshold, 15, "12 in series window blocks 15+");

// ESPN-style matchup (SA) still matches SAS vs OKC
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

console.log("verify-h2h: all assertions passed");
