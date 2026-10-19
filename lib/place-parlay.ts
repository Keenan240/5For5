import { getState, setState } from "./kv";
import {
  calcPayout,
  combineParlayOdds,
  formatAmerican,
  isStakeTier,
  parlayConfidence,
  parseAmericanOdds,
  roundMoney,
  weakestStakeTier,
  type StakeTier,
} from "./odds";
import { getEspnAthleteId } from "./espn";
import { formatMilestoneLabel } from "./milestones";
import { hasSlipForDate, normalizePendingList } from "./pending";
import type {
  ParlayLeg,
  ParlayState,
  PendingParlay,
  RankedPoolPick,
} from "./types";

export type PlaceParlayInput = {
  date: string;
  legs: ParlayLeg[];
  rankedPool?: RankedPoolPick[];
  /** User-chosen $2 / $5 / $10; defaults to risk recommendation. */
  stake?: StakeTier;
  /** Signed-in user id (or `local` when auth is off). */
  userId?: string | null;
};

export type PlaceParlayResult = {
  ok: boolean;
  message: string;
  state: ParlayState;
  error?: string;
};

export function buildPendingFromLegs(
  date: string,
  legs: ParlayLeg[],
  bankroll: number,
  rankedPool?: RankedPoolPick[],
  stakeOverride?: StakeTier
): { pending: PendingParlay; error?: string } {
  const legOdds = legs.map((l) => l.odds);

  const recommended = weakestStakeTier(legOdds);
  const stake =
    stakeOverride && isStakeTier(stakeOverride) ? stakeOverride : recommended;
  void bankroll; // tracker mode — stake is metadata only

  const parlayOdds = combineParlayOdds(legOdds);
  const potentialPayout = calcPayout(stake, parlayOdds);
  const confidence = parlayConfidence(legs, stake);

  return {
    pending: {
      date,
      stake,
      legs,
      parlayOdds,
      potentialPayout,
      confidence,
      rankedPool: rankedPool?.length ? rankedPool : undefined,
    },
  };
}

export async function runPlaceParlay(
  input: PlaceParlayInput
): Promise<PlaceParlayResult> {
  let state = await getState(input.userId);

  if (hasSlipForDate(state, input.date)) {
    const error =
      "You already have a slip for this night. One parlay per day — pick another date or cancel/settle the existing one.";
    return { ok: false, message: error, state, error };
  }

  if (!input.legs?.length) {
    return { ok: false, message: "No legs to place.", state, error: "No legs" };
  }

  const legs: ParlayLeg[] = [];
  for (const leg of input.legs) {
    const odds =
      typeof leg.odds === "number"
        ? leg.odds
        : parseAmericanOdds(String(leg.odds));
    if (odds === null) {
      return {
        ok: false,
        message: `Invalid odds for ${leg.player}. Use American format (e.g. -280, +150).`,
        state,
        error: "Invalid odds",
      };
    }
    const espnAthleteId =
      leg.espnAthleteId?.trim() ||
      (await getEspnAthleteId(leg.player)) ||
      undefined;
    legs.push({ ...leg, odds, espnAthleteId });
  }

  const { pending, error } = buildPendingFromLegs(
    input.date,
    legs,
    state.bankroll,
    input.rankedPool,
    input.stake
  );
  if (error || !pending) {
    return { ok: false, message: error ?? "Could not build parlay.", state, error };
  }

  const pendingList = normalizePendingList(state.pending);
  state = {
    ...state,
    bankroll: roundMoney(state.bankroll - pending.stake),
    pending: [...pendingList, pending],
  };
  await setState(state, input.userId);

  const legLines = pending.legs.map(
    (l) =>
      `✦ ${l.player}  ${formatMilestoneLabel(l.stat, l.threshold)}  ${formatAmerican(l.odds)}  5/5  last 5: ${l.last5.join(", ")}`
  );

  const summary = [
    `PARLAY LOCKED — ${pending.date}`,
    "",
    ...legLines,
    "",
    `Confidence:  ${pending.confidence}`,
    `Parlay Odds: ${formatAmerican(pending.parlayOdds)}`,
  ].join("\n");

  return { ok: true, message: summary, state };
}
