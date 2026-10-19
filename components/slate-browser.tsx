"use client";

import { useMemo, useState } from "react";
import { LADDERS, STAT_CATEGORIES, formatMilestoneLabel } from "@/lib/milestones";
import type { StatCategory } from "@/lib/types";
import { PlayerLegCard } from "@/components/player-leg-card";
import { legKey, playerStatKey } from "@/lib/parlay-selection";

export type BrowseCandidate = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  last5: number[];
  score: number;
  odds: number;
  buffer: number;
  espnAthleteId?: string;
};

type SlateGame = { home: string; away: string; status: string };

type SlateBrowserProps = {
  games: SlateGame[];
  candidates: BrowseCandidate[];
  selectedKeys: Set<string>;
  /** player|stat keys already on the parlay — blocks other thresholds in that category. */
  selectedPlayerStats: Set<string>;
  maxLegs: number;
  onToggle: (c: BrowseCandidate) => void;
  disabled?: boolean;
  scanning?: boolean;
};

function gameLabel(g: SlateGame): string {
  return `${g.away} @ ${g.home}`;
}

function matchupForTeam(team: string, games: SlateGame[]): string {
  const t = team.toUpperCase();
  const g = games.find(
    (x) => x.home.toUpperCase() === t || x.away.toUpperCase() === t
  );
  return g ? `${g.away} @ ${g.home}` : team;
}

export function SlateBrowser({
  games,
  candidates,
  selectedKeys,
  selectedPlayerStats,
  maxLegs,
  onToggle,
  disabled,
  scanning,
}: SlateBrowserProps) {
  const [openStat, setOpenStat] = useState<StatCategory | null>("Points");
  const [thresholdByStat, setThresholdByStat] = useState<
    Partial<Record<StatCategory, number>>
  >({});
  const [openGame, setOpenGame] = useState<string | null>(null);

  const atCap = selectedKeys.size >= maxLegs;

  const thresholdsFor = (stat: StatCategory) => {
    const ladder = LADDERS[stat];
    const present = new Set(
      candidates.filter((c) => c.stat === stat).map((c) => c.threshold)
    );
    const filtered = ladder.filter((t) => present.has(t));
    return filtered.length > 0 ? filtered : ladder.slice(0, 5);
  };

  const activeThreshold = (stat: StatCategory) => {
    const opts = thresholdsFor(stat);
    const chosen = thresholdByStat[stat];
    if (chosen != null && opts.includes(chosen)) return chosen;
    return opts[0] ?? LADDERS[stat][0];
  };

  const gamesWithPlayers = useMemo(() => {
    if (!openStat) return [];
    const ladder = LADDERS[openStat];
    const present = new Set(
      candidates.filter((c) => c.stat === openStat).map((c) => c.threshold)
    );
    const opts = ladder.filter((t) => present.has(t));
    const thresholds = opts.length > 0 ? opts : ladder.slice(0, 5);
    const chosen = thresholdByStat[openStat];
    const th =
      chosen != null && thresholds.includes(chosen)
        ? chosen
        : (thresholds[0] ?? ladder[0]);
    const pool = candidates.filter(
      (c) => c.stat === openStat && c.threshold === th
    );
    return games
      .map((g) => {
        const players = pool.filter((c) => {
          const t = c.team.toUpperCase();
          return (
            t === g.home.toUpperCase() || t === g.away.toUpperCase()
          );
        });
        return { game: g, players };
      })
      .filter((row) => row.players.length > 0);
  }, [candidates, games, openStat, thresholdByStat]);

  return (
    <section className="mb-4 space-y-2">
      {scanning && candidates.length === 0 && (
        <p className="mb-2 px-0.5 text-xs text-[var(--text-muted)]">
          Scanning slate…
        </p>
      )}

      {STAT_CATEGORIES.map((stat) => {
        const expanded = openStat === stat;
        const th = activeThreshold(stat);
        const thresholds = thresholdsFor(stat);
        const statCount = candidates.filter((c) => c.stat === stat).length;

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

            {expanded && (
              <div className="mx-4 border-t border-[var(--border)] pb-3 pt-2">
                <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-muted)] p-1">
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

                {gamesWithPlayers.length === 0 ? (
                  <p className="px-0 py-2 text-xs text-[var(--text-subtle)]">
                    No players at {formatMilestoneLabel(stat, th)} on this slate.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {gamesWithPlayers.map(({ game, players }) => {
                      const key = gameLabel(game);
                      const gameOpen = openGame === key;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenGame((g) => (g === key ? null : key))
                            }
                            className="flex w-full items-center gap-2 py-2.5 text-left"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                              {key}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-[var(--text-subtle)]">
                              {players.length} player
                              {players.length === 1 ? "" : "s"}
                            </span>
                            <Chevron open={gameOpen} />
                          </button>
                          {gameOpen && (
                            <ul className="mb-2 divide-y divide-[var(--border)]">
                              {players.map((c) => {
                                const k = legKey(c);
                                const selected = selectedKeys.has(k);
                                const categoryTaken =
                                  !selected &&
                                  selectedPlayerStats.has(playerStatKey(c));
                                const canAdd =
                                  selected || (!atCap && !categoryTaken);
                                return (
                                  <li key={k}>
                                    <PlayerLegCard
                                      player={c.player}
                                      matchup={matchupForTeam(c.team, games)}
                                      espnAthleteId={c.espnAthleteId}
                                      last5={c.last5}
                                      threshold={c.threshold}
                                      stat={c.stat}
                                      action={
                                        <button
                                          type="button"
                                          disabled={
                                            disabled ||
                                            (!selected && !canAdd)
                                          }
                                          title={
                                            categoryTaken
                                              ? "Already added in this category"
                                              : undefined
                                          }
                                          onClick={() => onToggle(c)}
                                          className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                                            selected
                                              ? "bg-black text-white"
                                              : "border border-[var(--border-strong)] bg-white text-[var(--text)]"
                                          }`}
                                        >
                                          {selected ? "Added" : "Add"}
                                        </button>
                                      }
                                    />
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
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
      className={`text-[var(--text-subtle)] transition-transform ${
        open ? "rotate-90" : "rotate-0"
      }`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
