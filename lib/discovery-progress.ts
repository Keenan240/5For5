import type { ParlayDraft, StatCategory } from "./types";

export type MilestoneHit = {
  stat: StatCategory;
  threshold: number;
  last5: number[];
  odds: number;
  buffer: number;
  score: number;
  h2hOpponent?: string;
  h2hGate?: string;
  h2hLine?: string;
};

export type RankedPick = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  score: number;
  rank: number;
  odds: number;
  last5: number[];
  buffer: number;
  /** @deprecated use selected */
  picked?: boolean;
  selected: boolean;
};

export type CreateProgressEvent =
  | { type: "phase"; message: string }
  | {
      type: "slate";
      date: string;
      games: string[];
      rosterCount: number;
      rosterSource?: string;
    }
  | {
      type: "scan";
      index: number;
      total: number;
      player: string;
      team: string;
    }
  | {
      type: "player_result";
      player: string;
      team: string;
      status: "qualified" | "short_log" | "no_id" | "no_milestone";
      gameCount?: number;
      milestones?: MilestoneHit[];
    }
  | {
      type: "discovery_done";
      qualified: number;
      evaluated: number;
      withFiveGames: number;
    }
  | {
      type: "build_start";
      legCount: number;
      poolSize: number;
    }
  | {
      type: "build_ranked";
      ranked: RankedPick[];
      parlayLegCount: number;
    }
  | {
      type: "build_step";
      player: string;
      team: string;
      stat: StatCategory;
      threshold: number;
      action: "picked" | "skipped";
      reason: string;
    }
  | {
      type: "draft_ready";
      draft: ParlayDraft;
      qualifiedCount: number;
      rosterCount: number;
    }
  | {
      type: "complete";
      message: string;
      qualifiedCount: number;
      rosterCount: number;
      gamesTonight: string[];
      draft?: ParlayDraft;
      state?: unknown;
    }
  | { type: "noop"; message: string; state?: unknown }
  | { type: "error"; error: string; state?: unknown };

export type ProgressEmitter = (event: CreateProgressEvent) => void;
