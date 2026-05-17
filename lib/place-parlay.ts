import { getState, setState } from "./kv";
import {
  calcPayout,
  combineParlayOdds,
  formatAmerican,
  parlayConfidence,
  parseAmericanOdds,
  roundMoney,
  weakestStakeTier,
} from "./odds";
import { formatMilestoneLabel } from "./milestones";
import type { ParlayLeg, ParlayState, PendingParlay } from "./types";

export type PlaceParlayInput = {
  date: string;
  legs: ParlayLeg[];
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
  bankroll: number
): { pending: PendingParlay; error?: string } {
  const legOdds = legs.map((l) => l.odds);

  const stake = weakestStakeTier(legOdds);
  if (bankroll < stake) {
    return {
      pending: null as unknown as PendingParlay,
      error: `Bankroll $${bankroll} is below stake $${stake}.`,
    };
  }

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
    },
  };
}

export async function runPlaceParlay(
  input: PlaceParlayInput
): Promise<PlaceParlayResult> {
  let state = await getState();

  if (state.pending) {
    const error = "You already have a pending parlay. Settle it first.";
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
    legs.push({ ...leg, odds });
  }

  const { pending, error } = buildPendingFromLegs(
    input.date,
    legs,
    state.bankroll
  );
  if (error || !pending) {
    return { ok: false, message: error ?? "Could not build parlay.", state, error };
  }

  state = {
    ...state,
    bankroll: roundMoney(state.bankroll - pending.stake),
    pending,
  };
  await setState(state);

  const legLines = pending.legs.map(
    (l) =>
      `✦ ${l.player}  ${formatMilestoneLabel(l.stat, l.threshold)}  ${formatAmerican(l.odds)}  5/5  last 5: ${l.last5.join(", ")}`
  );

  const summary = [
    `PARLAY PLACED — ${pending.date}`,
    "",
    ...legLines,
    "",
    `Confidence:  ${pending.confidence}`,
    `Stake:       $${pending.stake}`,
    `Parlay Odds: ${formatAmerican(pending.parlayOdds)}`,
    `To Win:      $${pending.potentialPayout.toFixed(2)}`,
    `Bankroll:    $${state.bankroll.toFixed(2)}`,
  ].join("\n");

  return { ok: true, message: summary, state };
}
