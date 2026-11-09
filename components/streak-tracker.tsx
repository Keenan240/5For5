"use client";

import { useEffect, useMemo, useState } from "react";
import { Collapse } from "@/components/collapse";
import { FiveForFive } from "@/components/five-for-five";
import { PlayerAvatar } from "@/components/player-avatar";
import { formatDisplayDate } from "@/lib/dates";
import {
  formatMilestoneLabel,
  LADDERS,
  STAT_CATEGORIES,
} from "@/lib/milestones";
import type { StreakEvent, StreakKind } from "@/lib/streak-events";
import type { StatCategory } from "@/lib/types";

const INITIAL_VISIBLE = 5;

type StreakTrackerProps = {
  /** Override night; omit to let API pick last completed slate. */
  date?: string;
};

type StreakApiResponse = {
  date: string;
  events: StreakEvent[];
  games: { home: string; away: string; status: string }[];
  error?: string;
  empty?: boolean;
};

function gameLabel(g: { away: string; home: string }): string {
  return `${g.away} @ ${g.home}`;
}

function matchupForTeam(
  team: string,
  games: { home: string; away: string }[]
): string {
  const t = team.toUpperCase();
  const g = games.find(
    (x) => x.home.toUpperCase() === t || x.away.toUpperCase() === t
  );
  return g ? gameLabel(g) : team;
}

export function StreakTracker({ date }: StreakTrackerProps) {
  const [data, setData] = useState<StreakApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<StreakKind>("broken");
  const [openStat, setOpenStat] = useState<StatCategory | null>("Points");
  const [thresholdByStat, setThresholdByStat] = useState<
    Partial<Record<StatCategory, number>>
  >({});
  const [expandedLists, setExpandedLists] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = date ? `?date=${encodeURIComponent(date)}` : "";
        const res = await fetch(`/api/streaks${qs}`);
        const json = (await res.json()) as StreakApiResponse;
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load streaks");
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load streaks");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    setExpandedLists(new Set());
  }, [kind]);

  const eventsForKind = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => e.kind === kind);
  }, [data, kind]);

  const thresholdsFor = (stat: StatCategory) => {
    const ladder = LADDERS[stat];
    const present = new Set(
      eventsForKind.filter((e) => e.stat === stat).map((e) => e.threshold)
    );
    const filtered = ladder.filter((t) => present.has(t));
    return filtered.length > 0 ? filtered : [];
  };

  const activeThreshold = (stat: StatCategory) => {
    const opts = thresholdsFor(stat);
    if (opts.length === 0) return null;
    const chosen = thresholdByStat[stat];
    if (chosen != null && opts.includes(chosen)) return chosen;
    return opts[0]!;
  };

  const playersFor = (stat: StatCategory) => {
    const th = activeThreshold(stat);
    if (th == null) return [];
    return eventsForKind.filter((e) => e.stat === stat && e.threshold === th);
  };

  const nightLabel = data?.date ? formatDisplayDate(data.date) : null;

  return (
    <section className="mb-4 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-[11px] leading-none text-[var(--text-subtle)]">
          {nightLabel
            ? `After ${nightLabel}`
            : loading
              ? "Loading last night…"
              : "Last night’s 5/5 breaks & creates"}
        </p>
        <div className="flex shrink-0 rounded-xl bg-[var(--surface-muted)] p-1">
          {(["broken", "created"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                kind === k
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {loading && <StreakSkeleton />}

      {error && !loading && (
        <p className="px-0.5 py-2 text-xs text-red-500">{error}</p>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {STAT_CATEGORIES.map((stat) => {
            const expanded = openStat === stat;
            const th = activeThreshold(stat);
            const thresholds = thresholdsFor(stat);
            const statCount = eventsForKind.filter((e) => e.stat === stat)
              .length;
            const players = playersFor(stat);
            const listKey = `${stat}|${th ?? ""}`;
            const showAll = expandedLists.has(listKey);
            const visible = showAll
              ? players
              : players.slice(0, INITIAL_VISIBLE);
            const remaining = Math.max(0, players.length - INITIAL_VISIBLE);

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
                    {statCount > 0 && (
                      <span className="ml-2 text-xs font-normal text-[var(--text-subtle)]">
                        {statCount}
                      </span>
                    )}
                  </span>
                  <Chevron open={expanded} />
                </button>

                <Collapse open={expanded}>
                  <div className="collapse-fade mx-4 border-t border-[var(--border)] pb-3 pt-2">
                    {thresholds.length === 0 ? (
                      <p className="py-2 text-xs text-[var(--text-subtle)]">
                        No {kind}{" "}
                        {stat === "3-Pointers" ? "3PM" : stat.toLowerCase()}{" "}
                        streaks for this night.
                      </p>
                    ) : (
                      <>
                        <div
                          className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-muted)] p-1"
                          style={{ touchAction: "pan-x pinch-zoom" }}
                        >
                          {thresholds.map((t) => {
                            const active = t === th;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() =>
                                  setThresholdByStat((prev) => ({
                                    ...prev,
                                    [stat]: t,
                                  }))
                                }
                                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  active
                                    ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                                    : "text-[var(--text-muted)]"
                                }`}
                              >
                                {t}+
                              </button>
                            );
                          })}
                        </div>

                        {players.length === 0 ? (
                          <p className="py-2 text-xs text-[var(--text-subtle)]">
                            No players at{" "}
                            {th != null
                              ? formatMilestoneLabel(stat, th)
                              : "this line"}
                            .
                          </p>
                        ) : (
                          <>
                            <ul className="divide-y divide-[var(--border)]">
                              {visible.map((e) => (
                                <li
                                  key={`${e.player}|${e.stat}|${e.threshold}|${e.kind}`}
                                  className="flex items-start gap-3 py-3"
                                >
                                  <PlayerAvatar
                                    name={e.player}
                                    espnAthleteId={e.espnAthleteId}
                                    size={48}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold text-[var(--text)]">
                                      {e.player}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                                      {matchupForTeam(
                                        e.team,
                                        data?.games ?? []
                                      )}
                                    </p>
                                    <div className="mt-1.5 flex items-baseline gap-2">
                                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                                        Last 5
                                      </span>
                                      <FiveForFive
                                        values={e.last5Post}
                                        threshold={e.threshold}
                                        stat={e.stat}
                                      />
                                    </div>
                                    {kind === "broken" &&
                                      e.nightValue != null && (
                                        <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                                          Broke it with {e.nightValue}
                                        </p>
                                      )}
                                  </div>
                                </li>
                              ))}
                            </ul>

                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLists((prev) => {
                                    const next = new Set(prev);
                                    if (showAll) next.delete(listKey);
                                    else next.add(listKey);
                                    return next;
                                  })
                                }
                                className="mt-1 w-full py-2.5 text-center text-xs font-semibold text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                              >
                                {showAll
                                  ? "Show less"
                                  : `Show ${remaining} more`}
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </Collapse>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StreakSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading streaks">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl bg-[var(--surface)] px-4 py-3.5"
        >
          <div className="flex items-center justify-between gap-3">
            <div
              className="sheet-skeleton h-4 rounded-md"
              style={{ width: `${42 + (i % 3) * 10}%` }}
            />
            <div className="sheet-skeleton h-3 w-3 rounded-sm" />
          </div>
          {i === 0 && (
            <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
              <div className="flex gap-1">
                {[56, 48, 48, 40].map((w, j) => (
                  <div
                    key={j}
                    className="sheet-skeleton h-7 rounded-lg"
                    style={{ width: w }}
                  />
                ))}
              </div>
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex items-start gap-3 py-1">
                  <div className="sheet-skeleton h-12 w-12 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div
                      className="sheet-skeleton h-3.5 rounded-md"
                      style={{ width: `${48 + j * 8}%` }}
                    />
                    <div className="sheet-skeleton h-3 w-1/3 rounded-md" />
                    <div className="sheet-skeleton h-3 w-2/3 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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
