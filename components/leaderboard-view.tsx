"use client";

import { useEffect, useState } from "react";
import { formatMilestoneLabel } from "@/lib/milestones";
import { formatAmerican } from "@/lib/odds";
import { formatDisplayDate } from "@/lib/dates";
import type {
  CommunityFeedItem,
  CommunityWeekGroup,
} from "@/lib/community-feed";

type LeaderboardViewProps = {
  signedIn: boolean;
  authEnabled: boolean;
};

type Scope = "week" | "lifetime";

export function LeaderboardView({
  signedIn,
  authEnabled,
}: LeaderboardViewProps) {
  const [scope, setScope] = useState<Scope>("week");
  const [items, setItems] = useState<CommunityFeedItem[]>([]);
  const [weeks, setWeeks] = useState<CommunityWeekGroup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs =
      scope === "week"
        ? "scope=week"
        : selectedWeek
          ? `scope=lifetime&week=${encodeURIComponent(selectedWeek)}`
          : "scope=lifetime";

    void fetch(`/api/community/feed?${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.ok) {
          setError(data?.error ?? "Could not load community feed.");
          setItems([]);
          setWeeks([]);
          return;
        }
        if (scope === "lifetime" && !selectedWeek) {
          setWeeks(data.weeks ?? []);
          setItems([]);
        } else {
          setItems(data.items ?? []);
          if (scope === "week") setWeeks([]);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load community feed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, selectedWeek]);

  function switchScope(next: Scope) {
    setScope(next);
    setSelectedWeek(null);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Live slips from the community.
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
              onClick={() => switchScope(id)}
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
          Sign in with Google so your parlays show up on the feed.
        </p>
      )}

      {scope === "lifetime" && selectedWeek && (
        <button
          type="button"
          onClick={() => setSelectedWeek(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]"
        >
          <span aria-hidden>←</span>
          All weeks
        </button>
      )}

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <li
              key={i}
              className="sheet-skeleton h-24 rounded-2xl"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </ul>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : scope === "lifetime" && !selectedWeek ? (
        weeks.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            No parlays on the feed yet — place a slip to start it.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-[var(--surface)]">
            {weeks.map((week) => (
              <li key={week.weekStart} className="border-b border-[var(--border)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelectedWeek(week.weekStart)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3.5 text-left active:bg-[var(--surface-muted)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {week.label}
                    </p>
                    <p className="text-[11px] text-[var(--text-subtle)]">
                      {week.count} parlay{week.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-[var(--text-subtle)]" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          {scope === "week"
            ? "No parlays this week yet — be the first to lock one in."
            : "No parlays for this week."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <FeedCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusTone(status: CommunityFeedItem["status"]) {
  if (status === "win") return "bg-green-500/15 text-green-700";
  if (status === "loss") return "bg-red-500/15 text-red-600";
  return "bg-amber-500/15 text-amber-700";
}

function statusLabel(status: CommunityFeedItem["status"]) {
  if (status === "win") return "Win";
  if (status === "loss") return "Loss";
  return "Open";
}

function FeedCard({ item }: { item: CommunityFeedItem }) {
  return (
    <article className="rounded-2xl bg-[var(--surface)] px-3 py-3">
      <div className="mb-2.5 flex items-center gap-2.5">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xs font-semibold">
            {item.handle.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text)]">
            {item.handle}
          </p>
          <p className="truncate text-[11px] text-[var(--text-subtle)]">
            {formatDisplayDate(item.date)} · ${item.stake} ·{" "}
            {formatAmerican(item.parlayOdds)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase ${statusTone(item.status)}`}
        >
          {statusLabel(item.status)}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {item.legs.map((leg) => (
          <li
            key={`${leg.player}-${leg.stat}-${leg.threshold}`}
            className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
          >
            <p className="min-w-0 truncate text-[13px] font-medium text-[var(--text)]">
              {leg.player}
            </p>
            <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
              {formatMilestoneLabel(leg.stat, leg.threshold)}
            </span>
          </li>
        ))}
      </ul>
      {item.status === "pending" && (
        <p className="mt-2 text-[11px] text-[var(--text-subtle)]">
          To win ${item.potentialPayout.toFixed(2)}
        </p>
      )}
      {item.status !== "pending" && item.profit != null && (
        <p
          className={`mt-2 text-[11px] font-medium ${
            item.profit >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {item.profit >= 0 ? "+" : ""}${item.profit.toFixed(2)}
        </p>
      )}
    </article>
  );
}
