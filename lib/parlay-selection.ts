import type { RankedPick } from "./discovery-progress";
import type { RiskPreference } from "./odds";
import type { ParlayDraft, ParlayLeg } from "./types";

export function legKey(p: {
  player: string;
  stat: string;
  threshold: number;
}): string {
  return `${p.player}|${p.stat}|${p.threshold}`;
}

/** One active leg per player per stat category (e.g. not 10+ and 15+ PTS). */
export function playerStatKey(p: { player: string; stat: string }): string {
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

/**
 * Among qualifying ladder rungs for one player|stat, pick by risk appetite.
 * LOW = safest floor, HIGH = juiciest (highest) line, MEDIUM = middle rung.
 */
export function pickThresholdForRisk(
  thresholds: number[],
  risk: RiskPreference
): number {
  const sorted = [...new Set(thresholds)].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (risk === "LOW") return sorted[0]!;
  if (risk === "HIGH") return sorted[sorted.length - 1]!;
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * Select top `count` legs. When risk is set, each player|stat uses the
 * risk-matched threshold before ranking — so Suggest 5 isn't stuck on the floor.
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

  const preferredKeys = new Set<string>();
  for (const picks of byPlayerStat.values()) {
    const chosen = pickThresholdForRisk(
      picks.map((p) => p.threshold),
      risk
    );
    const match =
      picks.find((p) => p.threshold === chosen) ??
      picks.slice().sort((a, b) => a.rank - b.rank)[0];
    if (match) preferredKeys.add(legKey(match));
  }

  const preferred = ranked
    .filter((r) => preferredKeys.has(legKey(r)))
    .sort((a, b) => a.rank - b.rank);

  const selectedKeys = new Set<string>();
  for (const r of preferred) {
    if (selectedKeys.size >= count) break;
    selectedKeys.add(legKey(r));
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
