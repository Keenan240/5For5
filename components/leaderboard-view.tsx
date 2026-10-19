"use client";

import { useEffect, useState } from "react";

type Row = {
  rank: number;
  handle: string;
  name: string;
  image?: string;
  wins: number;
  losses: number;
  weekWins: number;
  weekLosses: number;
};

type LeaderboardViewProps = {
  signedIn: boolean;
  authEnabled: boolean;
};

export function LeaderboardView({
  signedIn,
  authEnabled,
}: LeaderboardViewProps) {
  const [scope, setScope] = useState<"lifetime" | "week">("week");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(`/api/leaderboard?scope=${scope}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.ok) {
          setError(data?.error ?? "Could not load leaderboard.");
          setRows([]);
          return;
        }
        setRows(data.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Community W/L from settled slips.
        </p>
        <div className="flex rounded-xl bg-[var(--surface-muted)] p-0.5">
          {(
            [
              ["week", "This week"],
              ["lifetime", "All time"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                scope === id
                  ? "bg-white text-[var(--text)] shadow-sm"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {authEnabled && !signedIn && (
        <p className="rounded-2xl bg-[var(--surface)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
          Sign in with Google to track your own record on the board.
        </p>
      )}

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <li
              key={i}
              className="sheet-skeleton h-12 rounded-2xl"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </ul>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No settled records yet — be the first on the board.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-[var(--surface)]">
          {rows.map((row) => {
            const w = scope === "week" ? row.weekWins : row.wins;
            const l = scope === "week" ? row.weekLosses : row.losses;
            return (
              <li
                key={`${row.rank}-${row.handle}`}
                className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0"
              >
                <span className="w-6 text-center text-xs font-semibold tabular-nums text-[var(--text-subtle)]">
                  {row.rank}
                </span>
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.image}
                    alt=""
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold">
                    {row.handle.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {row.handle}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-subtle)]">
                    {row.name}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text)]">
                  {w}-{l}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
