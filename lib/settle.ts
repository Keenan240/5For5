import { STAT_KEY } from "./milestones";
import { getLatestGameStat, loadPlayerIdMap } from "./stats";
import { calcPayout, roundMoney } from "./odds";
import type { ParlayState, SettledParlay, SettledLeg } from "./types";

export async function settlePending(state: ParlayState): Promise<{
  state: ParlayState;
  summary: string | null;
}> {
  if (!state.pending) return { state, summary: null };

  const pending = state.pending;
  const idMap = await loadPlayerIdMap();

  const settledLegs: SettledLeg[] = await Promise.all(
    pending.legs.map(async (leg) => {
      const key = STAT_KEY[leg.stat];
      const latest = await getLatestGameStat(leg.player, key, idMap);
      const actualValue = latest?.value ?? 0;
      const hit = actualValue >= leg.threshold;
      return {
        ...leg,
        actualValue,
        hit,
        minutes: latest ? [latest.min] : leg.minutes,
      };
    })
  );

  const allHit = settledLegs.every((l) => l.hit);
  const payout = allHit
    ? calcPayout(pending.stake, pending.parlayOdds)
    : 0;
  const profit = roundMoney(payout - pending.stake);

  let failureAnalysis: string | undefined;
  if (!allHit) {
    const missed = settledLegs.filter((l) => !l.hit);
    const reasons = missed.map((l) => classifyMiss(l));
    failureAnalysis = reasons.join(". ");
  }

  const newBankroll = roundMoney(state.bankroll + profit);

  const settled: SettledParlay = {
    date: pending.date,
    stake: pending.stake,
    legs: settledLegs,
    parlayOdds: pending.parlayOdds,
    result: allHit ? "win" : "loss",
    payout,
    profit,
    bankrollAfter: newBankroll,
    failureAnalysis,
  };

  const newState: ParlayState = {
    bankroll: newBankroll,
    pending: null,
    history: [...state.history, settled],
  };

  const legLines = settledLegs
    .map(
      (l) =>
        `${l.hit ? "✅" : "❌"} ${l.player} ${l.threshold}+ ${abbrev(l.stat)} → got ${l.actualValue}`
    )
    .join("\n");

  const summary = [
    `${allHit ? "WIN" : "LOSS"} — ${pending.date}`,
    legLines,
    allHit
      ? `Stake $${pending.stake} → Payout $${payout} (+$${profit})`
      : `Lost $${pending.stake}`,
    `Bankroll: $${newBankroll}`,
    failureAnalysis ? `\nWhy it missed: ${failureAnalysis}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { state: newState, summary };
}

function abbrev(stat: string): string {
  const map: Record<string, string> = {
    Points: "PTS",
    Rebounds: "REB",
    Assists: "AST",
    "3-Pointers": "3PM",
    Steals: "STL",
    Blocks: "BLK",
  };
  return map[stat] ?? stat;
}

function classifyMiss(leg: SettledLeg): string {
  const min = leg.minutes?.[0];
  if (min !== undefined && min < 20) {
    return `${leg.player} played only ${min.toFixed(0)} min (injury/foul trouble)`;
  }

  const historicalHits = leg.last5.filter((v) => v >= leg.threshold).length;
  const avg =
    leg.last5.reduce((a, b) => a + b, 0) / leg.last5.length;

  if (historicalHits === 5 && leg.buffer < 1.5) {
    return `${leg.player} ${leg.threshold}+ was 5/5 but razor-thin buffer (avg ${avg.toFixed(1)}) — likely variance`;
  }
  if (historicalHits >= 4) {
    return `${leg.player} ${leg.threshold}+ was a strong trend (${historicalHits}/5) — this was variance`;
  }
  return `${leg.player} ${leg.threshold}+ line may have been too aggressive — only ${historicalHits}/5 historically`;
}
