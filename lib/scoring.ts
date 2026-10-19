import {

  STAT_CATEGORIES,

  LADDERS,

  discoverMilestone,
  thresholdsAtOrBelow,
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

import { gamesVsOpponent } from "./h2h";
import { normalizeGameLogDate, slateDateCandidates } from "./dates";
import { opponentForTeam, type GameMatchup } from "./slate-games";
import { mapWithConcurrency } from "./concurrency";
import { getEspnAthleteId } from "./espn";
import type { TonightSlate } from "./tonight";
import type { GameLog, QualifiedCandidate, ParlayLeg } from "./types";

import type {

  MilestoneHit,

  ProgressEmitter,

} from "./discovery-progress";



export type TonightPlayer = {
  player: string;
  team: string;
  nbaPlayerId?: string;
  espnAthleteId?: string;
};



export const PARLAY_LEG_COUNT = 5;

const DISCOVERY_CONCURRENCY = 20;

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

    espnAthleteId: p.espnAthleteId,

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
      : undefined,
    p.espnAthleteId
  );

  if (logs.length < 5) {

    const playerId = await getPlayerId(p.player, idMap, p.nbaPlayerId);

    const hasEspn =
      p.espnAthleteId || (await getEspnAthleteId(p.player));

    return {

      player: p,

      status: !playerId && !hasEspn ? "no_id" : "short_log",

      gameCount: logs.length,

      milestones: [],

      candidates: [],

    };

  }

  const milestones = buildMilestoneHits(logs);

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

function buildMilestoneHits(
  logs: GameLog[],
  extra?: Partial<MilestoneHit>
): MilestoneHit[] {
  const milestones: MilestoneHit[] = [];
  for (const stat of STAT_CATEGORIES) {
    const values = extractStatValues(logs, stat);
    const highest = discoverMilestone(values, LADDERS[stat]);
    if (highest === null) continue;
    for (const threshold of thresholdsAtOrBelow(highest, LADDERS[stat])) {
      const buffer = averageBuffer(values, threshold);
      const odds = estimateOddsFromBuffer(buffer, stat);
      milestones.push({
        stat,
        threshold,
        last5: values,
        buffer,
        odds,
        score: scoreLeg(buffer, odds, threshold),
        ...extra,
      });
    }
  }
  return milestones;
}

async function evaluatePlayerH2h(

  p: TonightPlayer,

  idMap: Map<string, string>,

  logCache: PlayerLogCache,

  fullLogCache: PlayerFullLogCache,

  options: DiscoveryOptions

): Promise<PlayerEval> {

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
    p.nbaPlayerId,
    p.espnAthleteId
  );

  let vsOpp = gamesVsOpponent(fullLogs, p.team, opponent);
  if (options.beforeSlateYmd) {
    const skip = new Set(slateDateCandidates(options.beforeSlateYmd));
    vsOpp = vsOpp.filter((g) => !skip.has(normalizeGameLogDate(g.date)));
  }

  // Last 5 head-to-head games (newest first → chronological for milestone check)
  const newest5 = vsOpp.slice(0, 5);
  if (newest5.length < 5) {
    const playerId = await getPlayerId(p.player, idMap, p.nbaPlayerId);
    const hasEspn = p.espnAthleteId || (await getEspnAthleteId(p.player));
    return {
      player: p,
      status: !playerId && !hasEspn ? "no_id" : "short_log",
      gameCount: newest5.length,
      milestones: [],
      candidates: [],
    };
  }

  const logs = [...newest5].reverse();
  const milestones = buildMilestoneHits(logs, {
    h2hOpponent: opponent,
    h2hGate: `H2H last 5 vs ${opponent}`,
    h2hLine: logs.map((g) => g.date.slice(5)).join(", "),
  });

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
        espnAthleteId: p.espnAthleteId,
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



  const takenPlayerStat = new Set<string>();
  const pickKeys = new Set<string>();
  for (const c of sorted) {
    if (pickKeys.size >= legCount) break;
    const ps = `${c.player}|${c.stat}`;
    if (takenPlayerStat.has(ps)) continue;
    takenPlayerStat.add(ps);
    pickKeys.add(`${c.player}|${c.stat}|${c.threshold}`);
  }

  const ranked = sorted.map((c, i) => {
    const key = `${c.player}|${c.stat}|${c.threshold}`;
    const selected = pickKeys.has(key);
    return {
      player: c.player,
      team: c.team,
      stat: c.stat,
      threshold: c.threshold,
      score: roundMoney(c.score * 100) / 100,
      rank: i + 1,
      odds: c.odds,
      last5: c.last5,
      buffer: roundMoney(c.buffer),
      espnAthleteId: c.espnAthleteId,
      selected,
      picked: selected,
    };
  });

  emit?.({
    type: "build_ranked",
    ranked,
    parlayLegCount: legCount,
  });

  const legs = sorted.filter((c) =>
    pickKeys.has(`${c.player}|${c.stat}|${c.threshold}`)
  );

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



  void bankroll;

  const avgBuffer =

    parlayLegs.reduce((s, l) => s + l.buffer, 0) / parlayLegs.length;

  const confidence =

    avgBuffer >= 4 && stake >= 5

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


