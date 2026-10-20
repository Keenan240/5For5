"use client";

import { useState } from "react";
import { Collapse } from "@/components/collapse";
import { TeamLogo } from "@/components/team-logo";

type SlateGame = { home: string; away: string; status: string };

type SlateGamesListProps = {
  games: SlateGame[];
  loading?: boolean;
};

const PREVIEW_COUNT = 3;
const SKELETON_COUNT = 3;

function GameRow({ g }: { g: SlateGame }) {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <TeamLogo abbrev={g.away} size={28} />
        <span className="truncate text-sm font-semibold text-[var(--text)]">
          {g.away}
        </span>
        <span className="shrink-0 text-xs text-[var(--text-subtle)]">@</span>
        <TeamLogo abbrev={g.home} size={28} />
        <span className="truncate text-sm font-semibold text-[var(--text)]">
          {g.home}
        </span>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-black">
        {g.status}
      </span>
    </li>
  );
}

function GameRowSkeleton({ delayMs }: { delayMs: number }) {
  return (
    <li
      className="flex items-center gap-3 px-2 py-2.5"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="sheet-skeleton h-7 w-7 shrink-0 rounded-full" />
        <div className="sheet-skeleton h-3.5 w-10 rounded" />
        <div className="sheet-skeleton h-2.5 w-3 shrink-0 rounded" />
        <div className="sheet-skeleton h-7 w-7 shrink-0 rounded-full" />
        <div className="sheet-skeleton h-3.5 w-10 rounded" />
      </div>
      <div className="sheet-skeleton h-3.5 w-12 shrink-0 rounded" />
    </li>
  );
}

export function SlateGamesList({ games, loading }: SlateGamesListProps) {
  const [showAll, setShowAll] = useState(false);
  const count = games.length;
  const header = loading
    ? "Loading games…"
    : count === 0
      ? "No games available"
      : `${count} Game${count === 1 ? "" : "s"} Available`;

  const preview = games.slice(0, PREVIEW_COUNT);
  const extra = games.slice(PREVIEW_COUNT);
  const remaining = Math.max(0, count - PREVIEW_COUNT);
  const canToggle = count > PREVIEW_COUNT;

  return (
    <section className="mb-3 rounded-2xl bg-[var(--surface)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-left text-sm font-semibold text-[var(--text)]">
          {header}
        </p>
        {canToggle && !loading && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
          >
            {showAll ? "Close" : "Show all"}
          </button>
        )}
      </div>

      {loading ? (
        <ul className="divide-y divide-[var(--border)]">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <GameRowSkeleton key={i} delayMs={i * 90} />
          ))}
        </ul>
      ) : count === 0 ? (
        <p className="px-1 pb-1 text-xs text-[var(--text-muted)]">
          No NBA games this night — pick another date above.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {preview.map((g) => (
              <GameRow key={`${g.away}-${g.home}`} g={g} />
            ))}
          </ul>
          <Collapse open={showAll && extra.length > 0}>
            <ul className="collapse-fade divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {extra.map((g) => (
                <GameRow key={`${g.away}-${g.home}`} g={g} />
              ))}
            </ul>
          </Collapse>
          {!showAll && remaining > 0 && (
            <p className="px-1 pt-2 text-center text-xs text-[var(--text-muted)]">
              {remaining} Additional Game{remaining === 1 ? "" : "s"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
