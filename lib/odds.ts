/** American odds helpers and stake tiers */

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
 * Estimate FanDuel-style milestone odds from buffer when API odds unavailable.
 * Bigger buffer → juicier (more negative) odds.
 */
export function estimateOddsFromBuffer(buffer: number, stat: string): number {
  const base =
    stat === "Points"
      ? -180
      : stat === "Rebounds"
        ? -200
        : stat === "Assists"
          ? -170
          : -190;

  if (buffer >= 8) return Math.min(base - 120, -450);
  if (buffer >= 5) return Math.min(base - 60, -280);
  if (buffer >= 3) return base;
  if (buffer >= 1.5) return base + 40;
  if (buffer >= 0.5) return base + 80;
  return base + 120;
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
