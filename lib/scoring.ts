import {

  STAT_CATEGORIES,

  LADDERS,

  discoverMilestone,

  extractStatValues,

  averageBuffer,

  formatMilestoneLabel,

} from "./milestones";

import {

  estimateOddsFromBuffer,

  combineParlayOdds,

  calcPayout,

  weakestStakeTier,

  roundMoney,

} from "./odds";

import {

  loadPlayerIdMap,

  getLast5Games,

  getPlayerId,

  type PlayerLogCache,

} from "./stats";

import { mapWithConcurrency } from "./concurrency";
import { getEspnAthleteId } from "./espn";

import type { TonightSlate } from "./tonight";

import type { QualifiedCandidate, ParlayLeg } from "./types";

import type {

  MilestoneHit,

  ProgressEmitter,

} from "./discovery-progress";



export type TonightPlayer = {

  player: string;

  team: string;

  nbaPlayerId?: string;

};



export const PARLAY_LEG_COUNT = 5;

const DISCOVERY_CONCURRENCY = 12;



export type DiscoveryResult = {

  candidates: QualifiedCandidate[];

  rosterCount: number;

  evaluatedCount: number;

  withFiveGames: number;

  gamesTonight: string[];

};



export async function discoverTonightCandidates(

  slate: TonightSlate

): Promise<DiscoveryResult> {

  return discoverTonightCandidatesWithProgress(slate);

}



export async function discoverTonightCandidatesWithProgress(

  slate: TonightSlate,

  emit?: ProgressEmitter

): Promise<DiscoveryResult> {

  const gamesTonight = slate.games.map((g) => `${g.away} @ ${g.home}`);

  const roster = slate.players;



  emit?.({ type: "phase", message: "Loading NBA player ID map…" });

  const idMap = await loadPlayerIdMap();

  const logCache: PlayerLogCache = new Map();



  const { candidates, withFiveGames } = await discoverFromRoster(
    roster,
    idMap,
    logCache,
    emit
  );

  return {
    candidates,
    rosterCount: slate.players.length,
    evaluatedCount: roster.length,
    withFiveGames,
    gamesTonight,
  };

}



type PlayerEval = {

  player: TonightPlayer;

  status: "qualified" | "short_log" | "no_id" | "no_milestone";

  gameCount: number;

  milestones: MilestoneHit[];

  selected: QualifiedCandidate | null;

};



async function evaluatePlayer(

  p: TonightPlayer,

  idMap: Map<string, string>,

  logCache: PlayerLogCache

): Promise<PlayerEval> {

  const logs = await getLast5Games(p.player, idMap, logCache, p.nbaPlayerId);

  if (logs.length < 5) {

    const playerId = await getPlayerId(p.player, idMap, p.nbaPlayerId);

    const hasEspn = await getEspnAthleteId(p.player);

    return {

      player: p,

      status: !playerId && !hasEspn ? "no_id" : "short_log",

      gameCount: logs.length,

      milestones: [],

      selected: null,

    };

  }



  const milestones: MilestoneHit[] = [];



  for (const stat of STAT_CATEGORIES) {

    const values = extractStatValues(logs, stat);

    const threshold = discoverMilestone(values, LADDERS[stat]);

    if (threshold === null) continue;



    const buffer = averageBuffer(values, threshold);

    const odds = estimateOddsFromBuffer(buffer, stat);

    milestones.push({

      stat,

      threshold,

      last5: values,

      buffer,

      odds,

      score: scoreLeg(buffer, odds),

    });

  }



  if (milestones.length === 0) {

    return {

      player: p,

      status: "no_milestone",

      gameCount: logs.length,

      milestones: [],

      selected: null,

    };

  }



  const best = milestones.reduce((a, b) => (a.score > b.score ? a : b));

  return {

    player: p,

    status: "qualified",

    gameCount: logs.length,

    milestones,

    selected: {

      player: p.player,

      team: p.team,

      stat: best.stat,

      threshold: best.threshold,

      last5: best.last5,

      buffer: best.buffer,

      odds: best.odds,

      score: best.score,

    },

  };

}



async function discoverFromRoster(

  roster: TonightPlayer[],

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  emit?: ProgressEmitter

): Promise<{ candidates: QualifiedCandidate[]; withFiveGames: number }> {
  const total = roster.length;
  let completed = 0;
  let withFiveGames = 0;



  const results = await mapWithConcurrency(

    roster,

    DISCOVERY_CONCURRENCY,

    async (p) => {

      const evalResult = await evaluatePlayer(p, idMap, logCache);

      completed++;



      emit?.({

        type: "scan",

        index: completed,

        total,

        player: p.player,

        team: p.team,

      });



      if (evalResult.gameCount >= 5) withFiveGames++;



      emit?.({

        type: "player_result",

        player: p.player,

        team: p.team,

        status: evalResult.status,

        gameCount: evalResult.gameCount,

        milestones:

          evalResult.milestones.length > 0 ? evalResult.milestones : undefined,

        selected: evalResult.milestones.find(

          (m) =>

            evalResult.selected &&

            m.stat === evalResult.selected.stat &&

            m.threshold === evalResult.selected.threshold

        ),

      });



      return evalResult;

    }

  );



  const candidates: QualifiedCandidate[] = results
    .map((r) => r.selected)
    .filter((c): c is QualifiedCandidate => c !== null)
    .sort((a, b) => b.score - a.score);

  return { candidates, withFiveGames };
}



function scoreLeg(buffer: number, odds: number): number {

  const oddsSweet =

    odds <= -119 && odds >= -399 ? 1.2 : odds > -399 ? 0.9 : 0.7;

  const bufferScore = Math.min(buffer / 5, 1.5);

  return bufferScore * oddsSweet;

}



export function buildParlay(

  pool: QualifiedCandidate[],

  legCount: number,

  bankroll: number

) {

  return buildParlayWithProgress(pool, legCount, bankroll);

}



export function buildParlayWithProgress(

  pool: QualifiedCandidate[],

  legCount: number,

  bankroll: number,

  emit?: ProgressEmitter

): {

  legs: ParlayLeg[];

  stake: number;

  parlayOdds: number;

  potentialPayout: number;

  confidence: "LOW" | "MEDIUM" | "HIGH";

} | null {

  if (pool.length < legCount || legCount < 3) return null;



  const sorted = [...pool].sort((a, b) => b.score - a.score);



  emit?.({

    type: "build_start",

    legCount,

    poolSize: sorted.length,

  });



  const ranked = sorted.map((c, i) => ({
    player: c.player,
    team: c.team,
    stat: c.stat,
    threshold: c.threshold,
    score: roundMoney(c.score * 100) / 100,
    rank: i + 1,
    odds: c.odds,
    last5: c.last5,
    buffer: roundMoney(c.buffer),
    selected: i < legCount,
    picked: i < legCount,
  }));

  emit?.({
    type: "build_ranked",
    ranked,
    parlayLegCount: legCount,
  });

  const legs = sorted.slice(0, legCount);

  for (const row of ranked) {
    emit?.({
      type: "build_step",
      player: row.player,
      team: row.team,
      stat: row.stat,
      threshold: row.threshold,
      action: row.selected ? "picked" : "skipped",
      reason: row.selected
        ? `Top ${legCount} by score (#${row.rank})`
        : `Rank #${row.rank} — not in top ${legCount}`,
    });
  }

  if (legs.length < legCount) return null;



  const parlayLegs: ParlayLeg[] = legs.map((l) => ({

    player: l.player,

    team: l.team,

    stat: l.stat,

    threshold: l.threshold,

    odds: l.odds,

    hitRate: "5/5",

    last5: l.last5,

    buffer: roundMoney(l.buffer),

  }));



  const legOdds = parlayLegs.map((l) => l.odds);

  const stake = weakestStakeTier(legOdds);

  const parlayOdds = combineParlayOdds(legOdds);

  const potentialPayout = calcPayout(stake, parlayOdds);



  if (bankroll < stake) return null;



  const avgBuffer =

    parlayLegs.reduce((s, l) => s + l.buffer, 0) / parlayLegs.length;

  const confidence =

    avgBuffer >= 4 && stake >= 4

      ? "HIGH"

      : avgBuffer >= 2

        ? "MEDIUM"

        : "LOW";



  return {

    legs: parlayLegs,

    stake,

    parlayOdds,

    potentialPayout,

    confidence,

  };

}



export function countQualifyingLegs(pool: QualifiedCandidate[]): number {

  return pool.length;

}



export function formatHitLine(hit: MilestoneHit): string {

  return `${formatMilestoneLabel(hit.stat, hit.threshold)} (${hit.last5.join(",")})`;

}


