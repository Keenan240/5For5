"use client";

import { useEffect, useMemo, useState } from "react";
import { Collapse } from "@/components/collapse";
import { PlayerLegCard } from "@/components/player-leg-card";
import {
  formatMilestoneLabel,
  STAT_CATEGORIES,
} from "@/lib/milestones";
import {
  buildStatBoards,
  swapCandidatesForStat,
  type BrowseLike,
} from "@/lib/parlay-selection";
import type { RankedPick } from "@/lib/discovery-progress";
import type { RiskPreference } from "@/lib/odds";
import type { StatCategory } from "@/lib/types";
import { PARLAY_LEG_COUNT } from "@/lib/scoring";

const RISK_OPTIONS: { value: RiskPreference; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Med" },
  { value: "HIGH", label: "High" },
];

type SuggestBoardProps = {
  candidates: BrowseLike[];
  risk: RiskPreference;
  onRiskChange: (risk: RiskPreference) => void;
  scanning?: boolean;
  statsReady: boolean;
  onRefresh: () => void;
  games: { home: string; away: string; status: string }[];
};

function matchupForTeam(
  team: string,
  games: { home: string; away: string }[]
): string {
  const t = team.toUpperCase();
  const g = games.find(
    (x) => x.home.toUpperCase() === t || x.away.toUpperCase() === t
  );
  return g ? `${g.away} @ ${g.home}` : team;
}

export function SuggestBoard({
  candidates,
  risk,
  onRiskChange,
  scanning,
  statsReady,
  onRefresh,
  games,
}: SuggestBoardProps) {
  const [boards, setBoards] = useState<
    Partial<Record<StatCategory, RankedPick[]>>
  >({});
  const [openStat, setOpenStat] = useState<StatCategory | null>("Points");
  const [swapSlot, setSwapSlot] = useState<{
    stat: StatCategory;
    index: number;
    removed: RankedPick;
  } | null>(null);

  const computed = useMemo(() => {
    if (candidates.length === 0) {
      return {} as Record<StatCategory, RankedPick[]>;
    }
    return buildStatBoards(candidates, risk, PARLAY_LEG_COUNT);
  }, [candidates, risk]);

  useEffect(() => {
    setBoards(computed);
    setSwapSlot(null);
  }, [computed]);

  const swapOptions = useMemo(() => {
    if (!swapSlot) return [];
    const board = boards[swapSlot.stat] ?? [];
    return swapCandidatesForStat(candidates, swapSlot.stat, board, risk);
  }, [swapSlot, boards, candidates, risk]);

  function removeLeg(stat: StatCategory, index: number) {
    const current = boards[stat] ?? [];
    const removed = current[index];
    if (!removed) return;
    setBoards((prev) => {
      const list = [...(prev[stat] ?? [])];
      list.splice(index, 1);
      return { ...prev, [stat]: list };
    });
    setOpenStat(stat);
    setSwapSlot({ stat, index, removed });
  }

  function applySwap(pick: RankedPick) {
    if (!swapSlot) return;
    const { stat, index } = swapSlot;
    setBoards((prev) => {
      const list = [...(prev[stat] ?? [])];
      const next: RankedPick = {
        ...pick,
        selected: true,
        rank: index + 1,
      };
      if (index >= list.length) list.push(next);
      else list.splice(index, 0, next);
      return {
        ...prev,
        [stat]: list.slice(0, PARLAY_LEG_COUNT).map((r, i) => ({
          ...r,
          rank: i + 1,
        })),
      };
    });
    setSwapSlot(null);
  }

  function cancelSwap() {
    if (!swapSlot) return;
    const { stat, index, removed } = swapSlot;
    setBoards((prev) => {
      const list = [...(prev[stat] ?? [])];
      list.splice(index, 0, removed);
      return {
        ...prev,
        [stat]: list.slice(0, PARLAY_LEG_COUNT).map((r, i) => ({
          ...r,
          rank: i + 1,
        })),
      };
    });
    setSwapSlot(null);
  }

  return (
    <section className="mb-4 space-y-3">
      <div
        className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-muted)] p-1"
        style={{ touchAction: "pan-x pinch-zoom" }}
        role="radiogroup"
        aria-label="Risk level"
      >
        {RISK_OPTIONS.map((opt) => {
          const active = risk === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onRiskChange(opt.value)}
              className={`min-h-9 flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <p className="px-0.5 text-[11px] text-[var(--text-subtle)]">
        One 5-leg board per stat. Tap Swap to replace a leg.
      </p>

      {!statsReady && !scanning && (
        <p className="rounded-2xl bg-[var(--surface)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
          Tap Refresh boards below (or Retrieve stats on Home) to build
          suggestions for tonight’s slate.
        </p>
      )}

      {scanning && !statsReady && (
        <p className="rounded-2xl bg-[var(--surface)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
          Scanning slate…
        </p>
      )}

      {statsReady &&
        STAT_CATEGORIES.map((stat) => {
          const legs = boards[stat] ?? [];
          const expanded = openStat === stat;
          const swappingHere = swapSlot?.stat === stat;

          return (
            <div
              key={stat}
              className="overflow-hidden rounded-2xl bg-[var(--surface)]"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenStat((s) => (s === stat ? null : stat))
                }
                className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              >
                <span className="text-sm font-semibold text-[var(--text)]">
                  {stat === "3-Pointers" ? "3PM" : stat}
                  <span className="ml-2 text-xs font-normal text-[var(--text-subtle)]">
                    {legs.length}/{PARLAY_LEG_COUNT}
                  </span>
                </span>
                <Chevron open={expanded} />
              </button>

              <Collapse open={expanded}>
                <div className="collapse-fade mx-4 border-t border-[var(--border)] pb-3 pt-1">
                  {legs.length === 0 && !swappingHere ? (
                    <p className="py-3 text-xs text-[var(--text-subtle)]">
                      No qualifying legs for this stat.
                    </p>
                  ) : (
                    <ul>
                      {legs.map((leg, index) => (
                        <li
                          key={`${leg.player}|${leg.threshold}|${index}`}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <PlayerLegCard
                            player={leg.player}
                            matchup={matchupForTeam(leg.team, games)}
                            espnAthleteId={leg.espnAthleteId}
                            last5={leg.last5}
                            threshold={leg.threshold}
                            stat={leg.stat}
                            action={
                              <button
                                type="button"
                                onClick={() => removeLeg(stat, index)}
                                className="rounded-full border border-[var(--border-strong)] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[var(--text)]"
                              >
                                Swap
                              </button>
                            }
                            footer={
                              <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                                {formatMilestoneLabel(leg.stat, leg.threshold)}
                                {Number.isFinite(leg.odds)
                                  ? ` · est. ${leg.odds > 0 ? "+" : ""}${leg.odds}`
                                  : ""}
                              </p>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  {swappingHere && (
                    <div className="mt-2 rounded-xl bg-[var(--surface-muted)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--text)]">
                          Pick a replacement
                          {legs.length < PARLAY_LEG_COUNT
                            ? ` · ${legs.length}/${PARLAY_LEG_COUNT} filled`
                            : ""}
                        </p>
                        <button
                          type="button"
                          onClick={cancelSwap}
                          className="text-[11px] font-medium text-[var(--text-muted)] underline-offset-2 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                      {swapOptions.length === 0 ? (
                        <p className="text-[11px] text-[var(--text-subtle)]">
                          No other candidates left for this stat.
                        </p>
                      ) : (
                        <ul className="max-h-64 space-y-1 overflow-y-auto">
                          {swapOptions.slice(0, 12).map((opt) => (
                            <li key={`${opt.player}|${opt.threshold}`}>
                              <button
                                type="button"
                                onClick={() => applySwap(opt)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left active:bg-[var(--surface)]"
                              >
                                <span className="min-w-0 truncate text-sm font-medium text-[var(--text)]">
                                  {opt.player}
                                </span>
                                <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">
                                  {formatMilestoneLabel(
                                    opt.stat,
                                    opt.threshold
                                  )}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </Collapse>
            </div>
          );
        })}

      <button
        type="button"
        onClick={onRefresh}
        disabled={!!scanning}
        className="flex min-h-12 w-full items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {scanning
          ? "Scanning…"
          : statsReady
            ? "Refresh boards"
            : "Scan slate"}
      </button>
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-[var(--text-subtle)] transition-transform duration-200 ease-out ${
        open ? "rotate-90" : "rotate-0"
      }`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
