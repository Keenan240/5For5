import type { RankedPick } from "./discovery-progress";
import type { ParlayDraft, ParlayLeg } from "./types";

export function legKey(p: {
  player: string;
  stat: string;
  threshold: number;
}): string {
  return `${p.player}|${p.stat}|${p.threshold}`;
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
  };
}

export function defaultSelectedRanked(ranked: RankedPick[], count: number): RankedPick[] {
  return ranked.map((r) => ({
    ...r,
    selected: r.rank <= count,
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
