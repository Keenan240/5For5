import { getState } from "./kv";
import {
  discoverTonightCandidatesWithProgress,
  buildParlayWithProgress,
  PARLAY_LEG_COUNT,
} from "./scoring";
import { getSlateForDate, getTonightSlate } from "./tonight";
import type { TonightGame } from "./tonight";
import { filterSlateByIncludedGames } from "./slate-games";
import { formatMilestoneLabel } from "./milestones";
import type { ProgressEmitter } from "./discovery-progress";
import type { ParlayDraft, ParlayState } from "./types";

export type CreateParlayOptions = {
  /** Subset of slate games to scan; default = all games on the slate. */
  includedGames?: Pick<TonightGame, "away" | "home">[];
  /** Head-to-head playoff weighting for discovery scores and milestone windows. */
  h2hMode?: boolean;
  /** Eastern YYYY-MM-DD slate to scan (default: tonight). */
  date?: string;
};

export async function parseCreateParlayRequest(
  request: Request
): Promise<CreateParlayOptions> {
  try {
    const body = await request.json();
    const date =
      typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : undefined;
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
          date,
        };
      }
    }
    if (body?.h2hMode === true || date) {
      return { h2hMode: body?.h2hMode === true, date };
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
  emit({ type: "phase", message: "Loading slate…" });

  const state = await getState();

  emit({ type: "phase", message: "Fetching games & rosters…" });
  const fullSlate = options.date
    ? await getSlateForDate(options.date)
    : await getTonightSlate();

  if (fullSlate.games.length === 0) {
    const message = `No NBA games scheduled for ${fullSlate.date} (ET). Try another night on the date strip.`;
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
    const message =
      "Couldn't load team rosters for this slate (ESPN roster blocked or empty). Try again in a moment.";
    emit({ type: "error", error: message });
    return { ok: false, message, state, error: message };
  }

  emit({
    type: "phase",
    message: options.h2hMode
      ? `Scanning ${slate.players.length} players (H2H — last 5 vs tonight’s opponent)…`
      : `Scanning ${slate.players.length} players (last 5 games via NBA or ESPN, every 5/5 milestone)…`,
  });

  const { candidates, rosterCount, withFiveGames } =
    await discoverTonightCandidatesWithProgress(slate, emit, {
      h2hMode: options.h2hMode,
      slateGames: slate.games,
      beforeSlateYmd: slate.date,
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

  // Tracker mode: don't block builds on simulated bankroll.
  const parlay = buildParlayWithProgress(
    candidates,
    legCount,
    Number.POSITIVE_INFINITY,
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
    "Enter each leg's FanDuel odds, then lock in the parlay.",
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
