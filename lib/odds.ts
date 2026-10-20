/** American odds helpers and stake tiers */

import { ladderFraction, LADDERS } from "./milestones";
import type { StatCategory } from "./types";

export function impliedProb(odds: number): number {
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100);
}

export function toDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

export function decimalToAmerican(dec: number): number {
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

export function combineParlayOdds(legOdds: number[]): number {
  const dec = legOdds.reduce((acc, o) => acc * toDecimal(o), 1);
  return decimalToAmerican(dec);
}

export function calcPayout(stake: number, parlayOdds: number): number {
  const dec = toDecimal(parlayOdds);
  return Math.round(stake * dec * 100) / 100;
}

/** True when odds are in the preferred range (better than -1200, i.e. not -2500 etc.) */
export function passesOddsCap(odds: number): boolean {
  return odds > -1200;
}

/** Allowed stake denominations ($2 / $5 / $10). */
export type StakeTier = 2 | 5 | 10;

export const STAKE_DENOMINATIONS: StakeTier[] = [2, 5, 10];

/**
 * Recommended stake from single-leg American odds.
 * Heavier favorites (more negative) → smaller / safer size.
 */
export function stakeTierForOdds(odds: number): StakeTier {
  if (odds >= -119) return 10;
  if (odds >= -399) return 5;
  return 2;
}

export function weakestStakeTier(legOdds: number[]): StakeTier {
  const tiers = legOdds.map(stakeTierForOdds);
  return Math.min(...tiers) as StakeTier;
}

export function isStakeTier(n: number): n is StakeTier {
  return n === 2 || n === 5 || n === 10;
}

/**
 * Estimate FanDuel-style milestone odds when API odds unavailable.
 * Higher ladder lines → juicier (less negative) payouts; fat buffers → heavier favorites.
 */
export function estimateOddsFromMilestone(
  stat: string,
  threshold: number,
  buffer: number
): number {
  const frac = ladderFraction(stat, threshold);
  // Floor locks ~-650; top-of-ladder ~-170 before buffer.
  let american = -650 + Math.round(frac * 480);

  const ladder = LADDERS[stat as StatCategory];
  const idx = ladder ? ladder.indexOf(threshold) : -1;
  const step =
    ladder && idx > 0
      ? ladder[idx]! - ladder[idx - 1]!
      : ladder && ladder.length > 1
        ? ladder[1]! - ladder[0]!
        : Math.max(threshold, 1);
  const relativeBuf = buffer / Math.max(threshold * 0.25, step, 1);

  if (relativeBuf >= 3) american -= 350;
  else if (relativeBuf >= 2) american -= 220;
  else if (relativeBuf >= 1.2) american -= 120;
  else if (relativeBuf >= 0.6) american -= 40;
  else if (relativeBuf < 0.25) american += 60;

  // Clamp to a FanDuel-ish milestone band (locks … soft juice).
  return Math.max(-1200, Math.min(-110, american));
}

/**
 * Prefer estimateOddsFromMilestone when threshold is known.
 * Uses a mid-ladder assumption so buffer still shifts the line.
 */
export function estimateOddsFromBuffer(buffer: number, stat: string): number {
  const ladder = LADDERS[stat as StatCategory];
  const mid =
    ladder && ladder.length
      ? ladder[Math.floor((ladder.length - 1) / 2)]!
      : 10;
  return estimateOddsFromMilestone(stat, mid, buffer);
}

export function formatAmerican(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function oddsToInputValue(odds: number): string {
  return formatAmerican(odds);
}

/** Parse FanDuel-style American odds from user input */
export function parseAmericanOdds(input: string): number | null {
  const s = input.trim().replace(/\s/g, "");
  if (!s) return null;

  const hasPlus = s.startsWith("+");
  const hasMinus = s.startsWith("-");
  const digits = s.replace(/^[+-]/, "");
  if (!/^\d+$/.test(digits)) return null;

  const n = parseInt(digits, 10);
  if (n < 100) return null;

  if (hasPlus) return n;
  if (hasMinus) return -n;
  return n;
}

export type RiskPreference = "LOW" | "MEDIUM" | "HIGH";

/** Stake size tied to the risk preference chosen before Suggest 5. */
export function stakeTierForRisk(risk: RiskPreference): StakeTier {
  if (risk === "LOW") return 10;
  if (risk === "HIGH") return 2;
  return 5;
}

export function stakeTierLabel(tier: StakeTier): string {
  if (tier === 10) return "$10 · low risk";
  if (tier === 5) return "$5 · medium risk";
  return "$2 · high risk";
}

export function parlayConfidence(
  legs: { buffer: number }[],
  stake: number
): "LOW" | "MEDIUM" | "HIGH" {
  const avgBuffer =
    legs.reduce((sum, l) => sum + l.buffer, 0) / Math.max(legs.length, 1);
  if (avgBuffer >= 4 && stake >= 5) return "HIGH";
  if (avgBuffer >= 2) return "MEDIUM";
  return "LOW";
}

export function roundMoney(x: number): number {
  return Math.round(x * 100) / 100;
}
