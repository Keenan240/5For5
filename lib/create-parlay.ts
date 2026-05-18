import { getState } from "./kv";
import {
  discoverTonightCandidatesWithProgress,
  buildParlayWithProgress,
  PARLAY_LEG_COUNT,
} from "./scoring";
import { getTonightSlate } from "./tonight";
import type { TonightGame } from "./tonight";
import { filterSlateByIncludedGames } from "./slate-games";
import { formatMilestoneLabel } from "./milestones";
import type { ProgressEmitter } from "./discovery-progress";
import type { ParlayDraft, ParlayState } from "./types";

export type CreateParlayOptions = {
  /** Subset of tonight's games to scan; default = all games on the slate. */
  includedGames?: Pick<TonightGame, "away" | "home">[];
  /** Head-to-head playoff weighting for discovery scores and milestone windows. */
  h2hMode?: boolean;
};

export async function parseCreateParlayRequest(
  request: Request
): Promise<CreateParlayOptions> {
  try {
    const body = await request.json();
    if (body?.includedGames && Array.isArray(body.includedGames)) {
      const includedGames = body.includedGames
        .filter(
          (g: unknown) =>
            g &&
            typeof g === "object" &&
            "away" in g &&
            "home" in g &&
            typeof (g as { away: unknown }).away === "string" &&
            typeof (g as { home: unknown }).home === "string"
        )
        .map((g: { away: string; home: string }) => ({
          away: g.away.toUpperCase(),
          home: g.home.toUpperCase(),
        }));
      if (includedGames.length > 0) {
        return {
          includedGames,
          h2hMode: body?.h2hMode === true,
        };
      }
    }
    if (body?.h2hMode === true) {
      return { h2hMode: true };
    }
  } catch {
    /* empty body = all games */
  }
  return {};
}

export type CreateParlayResult = {
  ok: boolean;
  message: string;
  state: ParlayState;
  qualifiedCount?: number;
  rosterCount?: number;
  gamesTonight?: string[];
  parlay?: unknown;
  draft?: ParlayDraft;
  error?: string;
};

export async function runCreateParlay(
  emit: ProgressEmitter,
  legCount: number = PARLAY_LEG_COUNT,
  options: CreateParlayOptions = {}
): Promise<CreateParlayResult> {
  emit({ type: "phase", message: "Loading bankroll & slate…" });

  const state = await getState();

  if (state.pending) {
    const error = "You already have a pending parlay. Settle it first.";
    emit({ type: "error", error, state });
    return { ok: false, message: error, state, error };
  }

  if (state.bankroll < 2) {
    const error = `Bankroll $${state.bankroll} is below minimum stake.`;
    emit({ type: "error", error, state });
    return { ok: false, message: error, state, error };
  }

  emit({ type: "phase", message: "Fetching tonight's games & rosters…" });
  const fullSlate = await getTonightSlate();

  if (fullSlate.games.length === 0) {
    const message = `No NBA games scheduled for ${fullSlate.date} (ET). No bet placed.`;
    emit({ type: "noop", message, state });
    return { ok: false, message, state };
  }

  const included =
    options.includedGames?.length ? options.includedGames : fullSlate.games;

  const slate = filterSlateByIncludedGames(fullSlate, included);

  if (slate.games.length === 0) {
    const message = "No games selected for discovery. No bet placed.";
    emit({ type: "noop", message, state });
    return { ok: false, message, state };
  }

  const gamesTonight = slate.games.map((g) => `${g.away} @ ${g.home}`);
  emit({
    type: "slate",
    date: slate.date,
    games: gamesTonight,
    rosterCount: slate.players.length,
    rosterSource: slate.rosterSource,
  });

  if (slate.players.length === 0) {
    emit({
      type: "phase",
      message: "Warning: no roster players loaded for tonight's teams.",
    });
  }

  emit({
    type: "phase",
    message: options.h2hMode
      ? `Scanning ${slate.players.length} players (H2H mode — same L5 5/5 + veto if any vs-opponent game is under the line)…`
      : `Scanning ${slate.players.length} players (last 5 games via NBA or ESPN, every 5/5 milestone)…`,
  });

  const { candidates, rosterCount, withFiveGames } =
    await discoverTonightCandidatesWithProgress(slate, emit, {
      h2hMode: options.h2hMode,
      slateGames: slate.games,
    });

  const qualifiedCount = candidates.length;

  emit({
    type: "discovery_done",
    qualified: qualifiedCount,
    evaluated: rosterCount,
    withFiveGames,
  });

  if (qualifiedCount < legCount) {
    const message = `Only ${qualifiedCount} qualifying legs (need ${legCount}) from ${rosterCount} roster players (${withFiveGames} with 5 recent games). No bet placed.`;
    emit({ type: "noop", message, state });
    return {
      ok: false,
      message,
      state,
      qualifiedCount,
      rosterCount,
      gamesTonight,
    };
  }

  emit({
    type: "phase",
    message: `Building ${legCount}-leg parlay from ${qualifiedCount} candidates…`,
  });

  const parlay = buildParlayWithProgress(
    candidates,
    legCount,
    state.bankroll,
    emit
  );

  if (!parlay) {
    const message = "Could not build parlay from qualifying pool.";
    emit({ type: "noop", message, state });
    return { ok: false, message, state, qualifiedCount };
  }

  const today = slate.date;
  const draft: ParlayDraft = {
    date: today,
    legs: parlay.legs,
    confidence: parlay.confidence,
  };

  emit({
    type: "draft_ready",
    draft,
    qualifiedCount,
    rosterCount,
  });

  const legLines = parlay.legs.map(
    (l) =>
      `✦ ${l.player}  ${formatMilestoneLabel(l.stat, l.threshold)}  5/5  last 5: ${l.last5.join(", ")}`
  );

  const summary = [
    `PARLAY BUILT — ${today}`,
    `Games: ${gamesTonight.join(" · ")}`,
    `Roster: ${rosterCount} players · ${qualifiedCount} qualifying legs`,
    "",
    ...legLines,
    "",
    `Suggested confidence: ${parlay.confidence}`,
    `Est. stake tier: $${parlay.stake} (updates when you enter FanDuel odds)`,
    "",
    "Enter each leg's odds below, then tap Place Parlay.",
  ].join("\n");

  emit({
    type: "complete",
    message: summary,
    qualifiedCount,
    rosterCount,
    gamesTonight,
    draft,
    state,
  });

  return {
    ok: true,
    message: summary,
    state,
    qualifiedCount,
    rosterCount,
    gamesTonight,
    parlay,
    draft,
  };
}
