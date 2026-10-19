"use client";

import { useEffect, useState } from "react";
import { formatMilestoneLabel } from "@/lib/milestones";
import {
  STAKE_DENOMINATIONS,
  calcPayout,
  formatAmerican,
  parseAmericanOdds,
  passesOddsCap,
  type StakeTier,
} from "@/lib/odds";
import { legKey } from "@/lib/parlay-selection";
import type { RankedPick } from "@/lib/discovery-progress";
import { PlayerLegCard } from "@/components/player-leg-card";
import { ParlayButtonSpinner } from "@/components/parlay-flow-status";

type DraftMath = {
  valid: boolean;
  stake: number;
  parlayOdds: number;
  payout: number;
  tierLabel?: string;
  hasJuiceLeg?: boolean;
} | null;

type SlateGame = { home: string; away: string };

type ParlaySheetProps = {
  picks: RankedPick[];
  maxLegs: number;
  oddsByLeg: Record<string, string>;
  onOddsChange: (key: string, value: string) => void;
  draftMath: DraftMath;
  placeError: string | null;
  onPlace: () => void;
  onDiscard: () => void;
  loading: boolean;
  /** Suggest 5 in progress — sheet open with skeleton legs. */
  generating?: boolean;
  gameCount: number;
  games?: SlateGame[];
  stake: StakeTier;
  onStakeChange: (stake: StakeTier) => void;
};

function matchupForTeam(team: string, games: SlateGame[]): string {
  const t = team.toUpperCase();
  const g = games.find(
    (x) => x.home.toUpperCase() === t || x.away.toUpperCase() === t
  );
  return g ? `${g.away} @ ${g.home}` : team;
}

function LegSkeleton({ delayMs }: { delayMs: number }) {
  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="sheet-skeleton h-12 w-12 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="sheet-skeleton h-3.5 w-[55%] rounded" />
            <div className="sheet-skeleton h-2.5 w-[35%] rounded" />
          </div>
          <div className="sheet-skeleton h-7 w-[4.5rem] shrink-0 rounded-full" />
        </div>
        <div className="sheet-skeleton h-2.5 w-[70%] rounded" />
        <div className="sheet-skeleton h-3 w-full rounded" />
      </div>
    </div>
  );
}

export function ParlaySheet({
  picks,
  maxLegs,
  oddsByLeg,
  onOddsChange,
  draftMath,
  placeError,
  onPlace,
  onDiscard,
  loading,
  generating = false,
  gameCount,
  games = [],
  stake,
  onStakeChange,
}: ParlaySheetProps) {
  const n = picks.length;
  const show = generating || n > 0;
  const [entered, setEntered] = useState(false);
  const [expanded, setExpanded] = useState(generating);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (generating || loading) setExpanded(true);
  }, [generating, loading]);

  if (!show) return null;

  const ready = !generating && !loading && n === maxLegs && draftMath?.valid;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div
        className={`pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] ring-1 ring-[var(--border)] transition-[height,transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded ? "h-[70vh]" : "h-[7.5rem]"
        } ${
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-[110%] opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full shrink-0 flex-col items-center px-4 pt-3.5"
          aria-expanded={expanded}
        >
          <span className="mb-5 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
          <div className="flex w-full items-center justify-between pb-2">
            <p className="text-sm font-semibold text-[var(--text)]">
              {loading ? (
                <>
                  Placing parlay
                  <span className="font-normal text-[var(--text-muted)]">
                    {" "}
                    · locking slip
                  </span>
                </>
              ) : generating ? (
                <>
                  Generating picks
                  <span className="font-normal text-[var(--text-muted)]">
                    {" "}
                    · analyzing slate
                  </span>
                </>
              ) : (
                <>
                  {n}-Leg Parlay
                  <span className="font-normal text-[var(--text-muted)]">
                    {" "}
                    | {gameCount} Game{gameCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </p>
            <span className="text-xs text-[var(--text-subtle)]">
              {loading || generating ? `0/${maxLegs}` : `${n}/${maxLegs}`}
            </span>
          </div>
        </button>

        {expanded && (
          <>
            <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto px-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <ParlayButtonSpinner />
                  <p className="text-sm text-[var(--text-muted)]">
                    Locking your slip…
                  </p>
                </div>
              ) : generating ? (
                <ul className="divide-y divide-[var(--border)]">
                  {Array.from({ length: maxLegs }, (_, i) => (
                    <li key={i}>
                      <LegSkeleton delayMs={i * 90} />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-[var(--border)] sheet-picks-reveal">
                  {picks.map((pick) => {
                    const key = legKey(pick);
                    const enteredOdds = parseAmericanOdds(oddsByLeg[key] ?? "");
                    const heavy =
                      enteredOdds !== null && !passesOddsCap(enteredOdds);
                    return (
                      <li key={key}>
                      <PlayerLegCard
                        player={pick.player}
                        matchup={matchupForTeam(pick.team, games)}
                        espnAthleteId={pick.espnAthleteId}
                        last5={pick.last5}
                        threshold={pick.threshold}
                        stat={pick.stat}
                        action={
                            <span className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text)]">
                              {formatMilestoneLabel(pick.stat, pick.threshold)}
                            </span>
                          }
                          footer={
                            <div
                              className={`mt-2 border-b pb-0.5 ${
                                heavy
                                  ? "border-amber-400/60"
                                  : "border-[var(--border-strong)] focus-within:border-[var(--text)]"
                              }`}
                            >
                              <input
                                type="text"
                                inputMode="text"
                                value={oddsByLeg[key] ?? ""}
                                onChange={(e) =>
                                  onOddsChange(key, e.target.value)
                                }
                                placeholder="FanDuel odds e.g. −280"
                                className="w-full bg-transparent py-1 font-mono text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
                                disabled={loading}
                              />
                            </div>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              {!generating && !loading && draftMath?.valid && (
                <div className="mt-3 mb-4 space-y-3">
                  <div className="space-y-0.5 pb-1 text-center">
                    <p className="text-lg font-semibold tracking-tight text-[var(--text)]">
                      Pays ${calcPayout(stake, draftMath.parlayOdds).toFixed(2)}
                    </p>
                    <p className="text-[11px] text-[var(--text-subtle)]">
                      Odds {formatAmerican(draftMath.parlayOdds)}
                    </p>
                  </div>
                  <div className="flex gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
                    {STAKE_DENOMINATIONS.map((d) => {
                      const active = stake === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => onStakeChange(d)}
                          disabled={loading}
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                            active
                              ? "bg-white text-[var(--text)] shadow-sm"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          ${d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {placeError && !loading && (
                <p className="mt-2 text-center text-xs text-red-500">
                  {placeError}
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--border)] px-4 pb-3 pt-2">
              <button
                type="button"
                onClick={onPlace}
                disabled={loading || !ready || generating}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-black text-sm font-semibold text-white disabled:opacity-40"
              >
                {loading && <ParlayButtonSpinner />}
                {generating
                  ? "Generating…"
                  : loading
                    ? "Locking…"
                    : ready
                      ? `Lock in · $${stake}`
                      : n < maxLegs
                        ? `Add ${maxLegs - n} more leg${maxLegs - n === 1 ? "" : "s"}`
                        : "Enter odds to lock in"}
              </button>
              <button
                type="button"
                onClick={onDiscard}
                disabled={loading}
                className="mt-2 flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-white text-sm font-semibold text-[var(--text)] disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
