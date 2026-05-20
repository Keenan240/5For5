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

  getPlayerFullGameLogs,

  getPlayerId,

  type PlayerLogCache,

  type PlayerFullLogCache,

} from "./stats";

import {
  formatH2hVetoLine,
  gamesVsOpponent,
  passesH2hVetoVsOpponent,
} from "./h2h";

import { opponentForTeam, type GameMatchup } from "./slate-games";

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

export type DiscoveryOptions = {
  h2hMode?: boolean;
  slateGames?: GameMatchup[];
  /** Exclude slate-night games from last-5 (history backfill / pre-lock view). */
  beforeSlateYmd?: string;
};



export type DiscoveryResult = {

  candidates: QualifiedCandidate[];

  rosterCount: number;

  evaluatedCount: number;

  withFiveGames: number;

  gamesTonight: string[];

};



export async function discoverTonightCandidates(

  slate: TonightSlate,

  options: DiscoveryOptions = {}

): Promise<DiscoveryResult> {

  return discoverTonightCandidatesWithProgress(slate, undefined, options);

}



export async function discoverTonightCandidatesWithProgress(

  slate: TonightSlate,

  emit?: ProgressEmitter,

  options: DiscoveryOptions = {}

): Promise<DiscoveryResult> {

  const gamesTonight = slate.games.map((g) => `${g.away} @ ${g.home}`);

  const roster = slate.players;



  emit?.({ type: "phase", message: "Loading NBA player ID map…" });

  const idMap = await loadPlayerIdMap();

  const logCache: PlayerLogCache = new Map();

  const fullLogCache: PlayerFullLogCache = new Map();

  const discoveryOpts: DiscoveryOptions = {
    h2hMode: options.h2hMode,
    slateGames: options.slateGames ?? slate.games,
    beforeSlateYmd: options.beforeSlateYmd,
  };



  const { candidates, withFiveGames } = await discoverFromRoster(
    roster,
    idMap,
    logCache,
    emit,
    discoveryOpts,
    fullLogCache
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

  candidates: QualifiedCandidate[];

};



function milestoneToCandidate(

  p: TonightPlayer,

  m: MilestoneHit

): QualifiedCandidate {

  return {

    player: p.player,

    team: p.team,

    stat: m.stat,

    threshold: m.threshold,

    last5: m.last5,

    buffer: m.buffer,

    odds: m.odds,

    score: m.score,

  };

}



async function evaluatePlayer(

  p: TonightPlayer,

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  options: DiscoveryOptions,

  fullLogCache: PlayerFullLogCache

): Promise<PlayerEval> {

  if (options.h2hMode) {
    return evaluatePlayerH2h(p, idMap, logCache, fullLogCache, options);
  }

  return evaluatePlayerStandard(p, idMap, logCache, options);
}

async function evaluatePlayerStandard(

  p: TonightPlayer,

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  options: DiscoveryOptions = {}

): Promise<PlayerEval> {

  const logs = await getLast5Games(
    p.player,
    idMap,
    logCache,
    p.nbaPlayerId,
    options.beforeSlateYmd
      ? { beforeSlateYmd: options.beforeSlateYmd }
      : undefined
  );

  if (logs.length < 5) {

    const playerId = await getPlayerId(p.player, idMap, p.nbaPlayerId);

    const hasEspn = await getEspnAthleteId(p.player);

    return {

      player: p,

      status: !playerId && !hasEspn ? "no_id" : "short_log",

      gameCount: logs.length,

      milestones: [],

      candidates: [],

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

      score: scoreLeg(buffer, odds, threshold),

    });

  }

  if (milestones.length === 0) {

    return {

      player: p,

      status: "no_milestone",

      gameCount: logs.length,

      milestones: [],

      candidates: [],

    };

  }

  return {

    player: p,

    status: "qualified",

    gameCount: logs.length,

    milestones,

    candidates: milestones.map((m) => milestoneToCandidate(p, m)),

  };

}

async function evaluatePlayerH2h(

  p: TonightPlayer,

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  fullLogCache: PlayerFullLogCache,

  options: DiscoveryOptions

): Promise<PlayerEval> {

  const logs = await getLast5Games(
    p.player,
    idMap,
    logCache,
    p.nbaPlayerId,
    options.beforeSlateYmd
      ? { beforeSlateYmd: options.beforeSlateYmd }
      : undefined
  );

  if (logs.length < 5) {

    const playerId = await getPlayerId(p.player, idMap, p.nbaPlayerId);

    const hasEspn = await getEspnAthleteId(p.player);

    return {

      player: p,

      status: !playerId && !hasEspn ? "no_id" : "short_log",

      gameCount: logs.length,

      milestones: [],

      candidates: [],

    };

  }

  const opponent = opponentForTeam(
    p.team,
    options.slateGames ?? []
  );

  if (!opponent) {
    return evaluatePlayerStandard(p, idMap, logCache, options);
  }

  const fullLogs = await getPlayerFullGameLogs(
    p.player,
    idMap,
    fullLogCache,
    p.nbaPlayerId
  );

  const vsOpp = gamesVsOpponent(fullLogs, p.team, opponent);

  const milestones: MilestoneHit[] = [];

  for (const stat of STAT_CATEGORIES) {

    const values = extractStatValues(logs, stat);

    const threshold = discoverMilestone(values, LADDERS[stat]);

    if (threshold === null) continue;

    if (!passesH2hVetoVsOpponent(vsOpp, stat, threshold)) continue;

    const buffer = averageBuffer(values, threshold);

    const odds = estimateOddsFromBuffer(buffer, stat);

    milestones.push({

      stat,

      threshold,

      last5: values,

      buffer,

      odds,

      score: scoreLeg(buffer, odds, threshold),

      h2hOpponent: opponent,

      h2hGate: `L5 5/5 + H2H veto vs ${opponent}`,

      h2hLine: formatH2hVetoLine(vsOpp, stat, threshold),

    });

  }

  if (milestones.length === 0) {

    return {

      player: p,

      status: "no_milestone",

      gameCount: logs.length,

      milestones: [],

      candidates: [],

    };

  }

  return {

    player: p,

    status: "qualified",

    gameCount: logs.length,

    milestones,

    candidates: milestones.map((m) => milestoneToCandidate(p, m)),

  };

}



async function discoverFromRoster(

  roster: TonightPlayer[],

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  emit?: ProgressEmitter,

  options: DiscoveryOptions = {},

  fullLogCache: PlayerFullLogCache = new Map()

): Promise<{ candidates: QualifiedCandidate[]; withFiveGames: number }> {
  const total = roster.length;
  let completed = 0;
  let withFiveGames = 0;



  const results = await mapWithConcurrency(

    roster,

    DISCOVERY_CONCURRENCY,

    async (p) => {

      const evalResult = await evaluatePlayer(
        p,
        idMap,
        logCache,
        options,
        fullLogCache
      );

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

      });



      return evalResult;

    }

  );



  const candidates: QualifiedCandidate[] = results
    .flatMap((r) => r.candidates)
    .sort((a, b) => b.score - a.score);

  return { candidates, withFiveGames };
}



function scoreLeg(buffer: number, odds: number, threshold: number): number {

  const oddsSweet =

    odds <= -119 && odds >= -399 ? 1.2 : odds > -399 ? 0.9 : 0.7;

  const relativeBuffer = threshold > 0 ? buffer / threshold : 0;
  const bufferScore = Math.min(relativeBuffer, 1.5);

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


