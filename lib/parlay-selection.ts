import type { RankedPick } from "./discovery-progress";
import { ladderFraction, ladderIndex, LADDERS } from "./milestones";
import type { RiskPreference } from "./odds";
import type { StatCategory } from "./types";
import type { ParlayDraft, ParlayLeg } from "./types";

export function legKey(p: {
  player: string;
  stat: string;
  threshold: number;
}): string {
  return `${p.player}|${p.stat}|${p.threshold}`;
}

/** One active leg per player per stat category (e.g. not 10+ and 15+ PTS). */
export function playerStatKey(p: {
  player: string;
  team?: string;
  stat: string;
}): string {
  return `${p.player}|${p.stat}`;
}

export function rankedToLeg(r: RankedPick): ParlayLeg {
  return {
    player: r.player,
    team: r.team,
    stat: r.stat,
    threshold: r.threshold,
    odds: r.odds,
    hitRate: "5/5",
    last5: r.last5,
    buffer: r.buffer,
    espnAthleteId: r.espnAthleteId,
  };
}

type RiskPickShape = {
  stat: string;
  threshold: number;
  buffer: number;
  odds: number;
};

/**
 * Odds more negative than this aren't real FanDuel-style milestone markets
 * (e.g. 5+ PTS on a 25 PPG scorer). Suggest 5 should avoid them.
 */
export const PLAUSIBLE_ODDS_FLOOR = -1000;

export function isPlausibleMarket(odds: number): boolean {
  return odds > PLAUSIBLE_ODDS_FLOOR;
}

/** 0 = lowest available rung for this player|stat, 1 = their max 5/5. */
function relativeFrac(
  threshold: number,
  available: number[]
): number {
  const sorted = [...new Set(available)].sort((a, b) => a - b);
  if (sorted.length <= 1) return 1;
  const idx = sorted.indexOf(threshold);
  if (idx < 0) return 0;
  return idx / (sorted.length - 1);
}

function peakAround(value: number, target: number, width: number): number {
  return Math.max(0, 1 - Math.abs(value - target) / width);
}

/**
 * How well a 5/5 milestone fits a risk appetite.
 * Risk = payout aggressiveness among *plausible* lines (not fake -1200 locks).
 * `availableThresholds` = all qualifying rungs for this player|stat.
 */
export function riskFitScore(
  pick: RiskPickShape,
  risk: RiskPreference,
  availableThresholds?: number[]
): number {
  const available = availableThresholds?.length
    ? availableThresholds
    : [pick.threshold];
  const rel = relativeFrac(pick.threshold, available);
  const frac = ladderFraction(pick.stat, pick.threshold);
  const buf = Math.max(pick.buffer, 0);
  const odds = pick.odds;
  const idx = ladderIndex(pick.stat, pick.threshold);

  let score = 0;

  if (risk === "LOW") {
    // Safe but still a real line: a step or two under their max 5/5, not 5+ PTS.
    // Target odds around -450 to -650.
    const relTerm = peakAround(rel, 0.55, 0.45);
    const oddsTerm = peakAround(odds, -550, 280);
    const bufferTerm = Math.min(buf / 6, 1.2);
    score = relTerm * 1.4 + oddsTerm * 1.2 + bufferTerm * 0.6;
  } else if (risk === "MEDIUM") {
    // Mid of their available ladder; odds near -300.
    const relTerm = peakAround(rel, 0.7, 0.4);
    const oddsTerm = peakAround(odds, -300, 200);
    const bufferTerm = Math.min(buf / 5, 1) * (buf > 0.5 ? 1 : 0.5);
    score = relTerm * 1.2 + oddsTerm * 1.2 + bufferTerm * 0.5;
  } else {
    // HIGH: near their max 5/5; odds near -200.
    const relTerm = peakAround(rel, 1, 0.35);
    const oddsTerm = peakAround(odds, -220, 180);
    score = relTerm * 1.5 + oddsTerm * 1.3 + Math.min(buf / 4, 0.5);
    if (idx <= 1) score *= 0.25;
    const ladder = LADDERS[pick.stat as StatCategory];
    if (ladder && pick.threshold === ladder[0]) score *= 0.4;
  }

  // Never prefer fake markets — even for "safe."
  if (odds <= -1000) score *= 0.05;
  else if (odds <= -800) score *= 0.35;
  else if (odds <= -700 && risk !== "LOW") score *= 0.6;

  // Absolute ladder floors with huge cushions are almost never bettable.
  if (frac <= 0.15 && buf >= 8) score *= 0.2;

  return score;
}

/**
 * Among qualifying ladder rungs for one player|stat, pick by risk appetite.
 */
export function pickThresholdForRisk(
  picks: RiskPickShape[],
  risk: RiskPreference
): number {
  if (picks.length === 0) return 0;
  const available = picks.map((p) => p.threshold);
  let best = picks[0]!;
  let bestScore = riskFitScore(best, risk, available);
  for (let i = 1; i < picks.length; i++) {
    const p = picks[i]!;
    const s = riskFitScore(p, risk, available);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best.threshold;
}

/**
 * Select top `count` legs by risk fit (not global browse rank).
 * Prefers plausible FanDuel-ish odds; only falls back to locks if needed to fill.
 */
export function defaultSelectedRanked(
  ranked: RankedPick[],
  count: number,
  risk: RiskPreference = "LOW"
): RankedPick[] {
  if (count <= 0) {
    return ranked.map((r) => ({ ...r, selected: false }));
  }

  const byPlayerStat = new Map<string, RankedPick[]>();
  for (const r of ranked) {
    const ps = playerStatKey(r);
    const list = byPlayerStat.get(ps) ?? [];
    list.push(r);
    byPlayerStat.set(ps, list);
  }

  const preferred: { pick: RankedPick; available: number[] }[] = [];
  for (const picks of byPlayerStat.values()) {
    const available = picks.map((p) => p.threshold);
    const chosenTh = pickThresholdForRisk(picks, risk);
    const match =
      picks.find((p) => p.threshold === chosenTh) ??
      picks.slice().sort((a, b) => a.rank - b.rank)[0];
    if (match) preferred.push({ pick: match, available });
  }

  preferred.sort((a, b) => {
    const sa = riskFitScore(a.pick, risk, a.available);
    const sb = riskFitScore(b.pick, risk, b.available);
    return sb - sa;
  });

  // Prefer real markets first; fill with the rest only if slate is thin.
  const plausible = preferred.filter((x) => isPlausibleMarket(x.pick.odds));
  const implausible = preferred.filter((x) => !isPlausibleMarket(x.pick.odds));
  const ordered = [...plausible, ...implausible];

  const selectedKeys = new Set<string>();
  for (const { pick } of ordered) {
    if (selectedKeys.size >= count) break;
    selectedKeys.add(legKey(pick));
  }

  return ranked.map((r) => ({
    ...r,
    selected: selectedKeys.has(legKey(r)),
  }));
}

export function buildDraftFromSelection(
  date: string,
  ranked: RankedPick[],
  confidence: ParlayDraft["confidence"]
): ParlayDraft {
  const legs = ranked
    .filter((r) => r.selected)
    .sort((a, b) => a.rank - b.rank)
    .map(rankedToLeg);
  return { date, legs, confidence };
}

export function toggleRankedSelection(
  ranked: RankedPick[],
  rank: number,
  maxLegs: number
): RankedPick[] {
  const target = ranked.find((r) => r.rank === rank);
  if (!target) return ranked;

  const selectedCount = ranked.filter((r) => r.selected).length;

  if (target.selected) {
    return ranked.map((r) =>
      r.rank === rank ? { ...r, selected: false } : r
    );
  }

  if (selectedCount >= maxLegs) {
    return ranked;
  }

  return ranked.map((r) => (r.rank === rank ? { ...r, selected: true } : r));
}
