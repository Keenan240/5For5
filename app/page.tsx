"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ParlayDraft,
  ParlayLeg,
  ParlayState,
  PendingParlay,
  SettledParlay,
} from "@/lib/types";
import { formatMilestoneLabel } from "@/lib/milestones";
import {
  calcPayout,
  combineParlayOdds,
  formatAmerican,
  parseAmericanOdds,
  passesOddsCap,
  stakeTierLabel,
  weakestStakeTier,
} from "@/lib/odds";
import type {
  CreateProgressEvent,
  RankedPick,
} from "@/lib/discovery-progress";
import {
  defaultSelectedRanked,
  legKey,
  rankedToLeg,
  toggleRankedSelection,
} from "@/lib/parlay-selection";
import { PARLAY_LEG_COUNT } from "@/lib/scoring";
import { BootLoader } from "@/components/boot-loader";
import { FiveForFive } from "@/components/five-for-five";
import { formatDisplayDate, getTodayEastern } from "@/lib/dates";
import type { SettleLockReason } from "@/lib/settle-lock-ui";
import { settleButtonLabel, settleLockHint } from "@/lib/settle-lock-ui";

type SlateInfo = {
  date: string;
  games: { home: string; away: string; status: string }[];
  rosterCount: number;
  source: string;
  rosterSource?: string;
};

type LegStatInfo = {
  player: string;
  ready: boolean;
  source: string | null;
  matchedDate: string | null;
  pts: number | null;
  error?: string;
};

type SettleLockInfo = {
  locked: boolean;
  lockReason: SettleLockReason;
  unlockAt: string | null;
  unlockLabel: string;
  remainingMs: number;
  statsReady: boolean;
  allGamesFinal: boolean;
  usingFallbackUnlock: boolean;
  isTodaysSlate: boolean;
  deferredAfterRevert?: boolean;
  legsStats?: LegStatInfo[];
};

type StatusResponse = ParlayState & {
  qualifiedCount?: number;
  sliderMax?: number;
  slate?: SlateInfo;
  settleLock?: SettleLockInfo | null;
};

type ProgressLine = {
  id: number;
  text: string;
  kind: "info" | "ok" | "skip" | "warn" | "pick" | "phase";
};

let progressId = 0;

export default function Home() {
  const [state, setState] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(3);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(
    null
  );
  const [showSlate, setShowSlate] = useState(false);
  const [progressLines, setProgressLines] = useState<ProgressLine[]>([]);
  const [rankedPicks, setRankedPicks] = useState<RankedPick[]>([]);
  const [draftMeta, setDraftMeta] = useState<{
    date: string;
    confidence: ParlayDraft["confidence"];
  } | null>(null);
  const [oddsByLeg, setOddsByLeg] = useState<Record<string, string>>({});
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ index: 0, total: 0 });
  const [showScanReport, setShowScanReport] = useState(false);
  const [showDiscoveryLog, setShowDiscoveryLog] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [booting, setBooting] = useState(true);
  const [bootFading, setBootFading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const progressEndRef = useRef<HTMLDivElement>(null);

  const settleLock = useMemo(() => {
    const raw = state?.settleLock;
    if (!raw) return null;
    const timeRemainingMs =
      raw.unlockAt != null
        ? Math.max(0, new Date(raw.unlockAt).getTime() - clockMs)
        : 0;
    const waitingPlayers =
      raw.legsStats
        ?.filter((l) => !l.ready)
        .map((l) => l.player) ?? [];

    return {
      ...raw,
      remainingMs:
        raw.lockReason === "waiting_games" || raw.lockReason === "deferred"
          ? timeRemainingMs
          : raw.remainingMs,
      waitingPlayers,
    };
  }, [state?.settleLock, clockMs]);

  useEffect(() => {
    if (!state?.pending) return;
    const tick = setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [state?.pending]);

  function collapseScanSections() {
    setShowScanReport(false);
    setShowDiscoveryLog(false);
  }

  const selectedPicks = useMemo(
    () =>
      rankedPicks
        .filter((r) => r.selected)
        .sort((a, b) => a.rank - b.rank),
    [rankedPicks]
  );

  const selectedCount = selectedPicks.length;

  const draftMath = useMemo(() => {
    if (selectedPicks.length !== PARLAY_LEG_COUNT) return null;
    const parsed = selectedPicks.map((r) =>
      parseAmericanOdds(oddsByLeg[legKey(r)] ?? "")
    );
    const allValid = parsed.every((o) => o !== null);
    if (!allValid) {
      return { valid: false as const, stake: 0, parlayOdds: 0, payout: 0 };
    }
    const legOdds = parsed as number[];
    const stake = weakestStakeTier(legOdds);
    const parlayOdds = combineParlayOdds(legOdds);
    const payout = calcPayout(stake, parlayOdds);
    const hasJuiceLeg = legOdds.some((o) => !passesOddsCap(o));
    return {
      valid: true as const,
      stake,
      parlayOdds,
      payout,
      tierLabel: stakeTierLabel(stake),
      hasJuiceLeg,
    };
  }, [selectedPicks, oddsByLeg]);

  function toggleRankedPick(rank: number) {
    setRankedPicks((prev) =>
      toggleRankedSelection(prev, rank, PARLAY_LEG_COUNT)
    );
    setPlaceError(null);
  }

  function setOddsForLeg(key: string, value: string) {
    setOddsByLeg((prev) => ({ ...prev, [key]: value }));
    setPlaceError(null);
  }

  const fetchStatus = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    let tick: ReturnType<typeof setInterval> | undefined;
    if (!silent) {
      tick = setInterval(() => {
        setLoadProgress((p) => (p >= 88 ? p : p + 4));
      }, 60);
    }
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setState(data);
      if (!silent) {
        setLoadProgress(100);
        setBootFading(true);
        await new Promise((r) => setTimeout(r, 450));
        setBooting(false);
        setBootFading(false);
      }
    } finally {
      if (tick) clearInterval(tick);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!state?.pending || !settleLock?.locked) return;
    const ms =
      settleLock.lockReason === "waiting_stats" ? 5_000 : 15_000;
    const id = setInterval(() => {
      void fetchStatus({ silent: true });
    }, ms);
    return () => clearInterval(id);
  }, [
    state?.pending,
    settleLock?.locked,
    settleLock?.lockReason,
    fetchStatus,
  ]);

  useEffect(() => {
    if (!settleLock?.locked) return;
    if (
      settleLock.lockReason !== "waiting_games" &&
      settleLock.lockReason !== "deferred"
    ) {
      return;
    }
    if (settleLock.remainingMs > 0) return;
    void fetchStatus({ silent: true });
  }, [
    settleLock?.locked,
    settleLock?.lockReason,
    settleLock?.remainingMs,
    fetchStatus,
  ]);

  useEffect(() => {
    if (!historyOpen) return;
    const onScroll = () => {
      if (window.scrollY < 48) {
        setHistoryOpen(false);
        setHistoryVisibleCount(3);
        setHistoryExpandedId(null);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [historyOpen]);

  const historyNewestFirst = useMemo(
    () => (state?.history ? [...state.history].reverse() : []),
    [state?.history]
  );

  const roi =
    state != null
      ? (((state.bankroll - 200) / 200) * 100).toFixed(1)
      : "0.0";
  const roiPositive = state != null && state.bankroll >= 200;

  const parlayRecord = useMemo(() => {
    if (!state?.history.length) return null;
    const wins = state.history.filter((h) => h.result === "win").length;
    const losses = state.history.length - wins;
    return { wins, losses };
  }, [state?.history]);

  function pushProgress(text: string, kind: ProgressLine["kind"] = "info") {
    progressId += 1;
    setProgressLines((prev) => [...prev, { id: progressId, text, kind }]);
  }

  function handleProgressEvent(event: CreateProgressEvent) {
    switch (event.type) {
      case "phase":
        pushProgress(event.message, "phase");
        break;
      case "slate":
        pushProgress(
          `Slate ${formatDisplayDate(event.date)}: ${event.games.join(" · ")} · ${event.rosterCount} players (${event.rosterSource ?? "?"})`,
          "info"
        );
        setScanProgress({ index: 0, total: event.rosterCount });
        break;
      case "scan":
        setScanProgress({ index: event.index, total: event.total });
        pushProgress(
          `[${event.index}/${event.total}] ${event.player} (${event.team})`,
          "info"
        );
        break;
      case "player_result": {
        if (event.status === "qualified" && event.selected) {
          const label = formatMilestoneLabel(
            event.selected.stat,
            event.selected.threshold
          );
          const alt =
            event.milestones && event.milestones.length > 1
              ? ` · also: ${event.milestones
                  .filter(
                    (m) =>
                      m.stat !== event.selected!.stat ||
                      m.threshold !== event.selected!.threshold
                  )
                  .map((m) =>
                    formatMilestoneLabel(m.stat, m.threshold)
                  )
                  .join(", ")}`
              : "";
          pushProgress(
            `✓ ${event.player} → ${label} 5/5 [${event.selected.last5.join(", ")}]${alt}`,
            "ok"
          );
        } else if (event.status === "short_log") {
          pushProgress(
            `— ${event.player}: only ${event.gameCount}/5 games`,
            "skip"
          );
        } else if (event.status === "no_id") {
          pushProgress(`— ${event.player}: player ID not found`, "skip");
        } else {
          pushProgress(`— ${event.player}: no 5/5 milestone`, "skip");
        }
        break;
      }
      case "discovery_done":
        pushProgress(
          `Discovery done: ${event.qualified} qualify · ${event.withFiveGames} with 5 games · ${event.evaluated} scanned`,
          "phase"
        );
        break;
      case "build_start":
        pushProgress(
          `Ranking ${event.poolSize} candidates for ${event.legCount} legs…`,
          "phase"
        );
        break;
      case "build_ranked": {
        const ranked = defaultSelectedRanked(
          event.ranked.map((r) => ({
            ...r,
            selected: r.selected ?? r.picked ?? r.rank <= event.parlayLegCount,
          })),
          event.parlayLegCount
        );
        setRankedPicks(ranked);
        pushProgress(
          `Ranked ${ranked.length} picks — top ${event.parlayLegCount} selected (tap to swap)`,
          "phase"
        );
        for (const r of ranked) {
          pushProgress(
            `#${r.rank} ${r.player} ${formatMilestoneLabel(r.stat, r.threshold)} · score ${r.score.toFixed(2)}${r.selected ? " → IN PARLAY" : ""}`,
            r.selected ? "pick" : "info"
          );
        }
        break;
      }
      case "build_step": {
        const label = formatMilestoneLabel(event.stat, event.threshold);
        if (event.action === "picked") {
          pushProgress(`→ PICK ${event.player} ${label} — ${event.reason}`, "pick");
        } else {
          pushProgress(`  skip ${event.player} ${label} — ${event.reason}`, "skip");
        }
        break;
      }
      case "draft_ready":
        setDraftMeta({
          date: event.draft.date,
          confidence: event.draft.confidence,
        });
        setPlaceError(null);
        collapseScanSections();
        pushProgress(
          "Tap ranked picks to swap legs, enter FanDuel odds, then Place Parlay.",
          "phase"
        );
        break;
      case "complete":
        if (event.draft) {
          setDraftMeta({
            date: event.draft.date,
            confidence: event.draft.confidence,
          });
          collapseScanSections();
        }
        setMessage(event.message);
        break;
      case "noop":
        setMessage(event.message);
        break;
      case "error":
        setMessage(event.error);
        pushProgress(event.error, "warn");
        break;
    }
  }

  async function handleCreate() {
    setLoading("create");
    setMessage(null);
    setProgressLines([]);
    setRankedPicks([]);
    setDraftMeta(null);
    setOddsByLeg({});
    setPlaceError(null);
    setScanProgress({ index: 0, total: 0 });
    setShowScanReport(true);
    setShowDiscoveryLog(true);
    pushProgress("Starting create parlay…", "phase");

    try {
      const res = await fetch("/api/parlay/create/stream", {
        method: "POST",
      });

      if (!res.ok || !res.body) {
        setMessage("Create failed — bad response from server.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.replace(/^data:\s*/, "");
          try {
            const event = JSON.parse(json) as CreateProgressEvent;
            handleProgressEvent(event);
          } catch {
            /* ignore partial chunks */
          }
        }
      }

      await fetchStatus();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Create failed: ${err.message}`
          : "Create failed. Check the terminal for errors."
      );
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    if (loading === "create") {
      progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [progressLines, loading]);

  async function handlePlace() {
    if (selectedCount !== PARLAY_LEG_COUNT) {
      setPlaceError(
        `Select exactly ${PARLAY_LEG_COUNT} legs (${selectedCount} selected).`
      );
      return;
    }
    if (!draftMeta || !draftMath?.valid) {
      setPlaceError("Enter valid American odds for every leg (e.g. -280, +120).");
      return;
    }
    setLoading("place");
    setPlaceError(null);

    const legs: ParlayLeg[] = selectedPicks.map((r) => ({
      ...rankedToLeg(r),
      odds: parseAmericanOdds(oddsByLeg[legKey(r)]!)!,
    }));

    try {
      const res = await fetch("/api/parlay/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: draftMeta.date, legs }),
      });
      const data = await res.json();
      if (data.error || !data.ok) {
        setPlaceError(data.error ?? data.message ?? "Could not place parlay.");
        return;
      }
      setDraftMeta(null);
      setRankedPicks([]);
      setOddsByLeg({});
      if (data.message) setMessage(data.message);
      await fetchStatus();
    } catch {
      setPlaceError("Place parlay failed. Try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleRevertSettle() {
    if (
      !confirm(
        "Revert the last settled parlay? It will return to pending, bankroll will be restored, and settle will stay locked until tomorrow morning (2:30 AM ET)."
      )
    ) {
      return;
    }
    setLoading("revert");
    setMessage(null);
    try {
      const res = await fetch("/api/parlay/revert-settle", { method: "POST" });
      const data = await res.json();
      if (data.message) setMessage(data.message);
      if (data.error) setMessage(data.error);
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  async function handleSettle() {
    if (settleLock?.locked) {
      setMessage(
        !settleLock.statsReady
          ? "Tonight's box scores aren't in the stat feed yet."
          : `Too early to settle. Unlocks ${settleLock.unlockLabel}.`
      );
      return;
    }

    setLoading("settle");
    setMessage(null);
    try {
      const res = await fetch("/api/parlay/settle", { method: "POST" });
      const data = await res.json();
      if (data.message) setMessage(data.message);
      if (data.error) setMessage(data.error);
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  async function handleReset() {
    if (!confirm("Reset bankroll to $200 and clear history?")) return;
    await fetch("/api/reset", { method: "POST" });
    setMessage(null);
    setHistoryOpen(false);
    setHistoryVisibleCount(3);
    await fetchStatus();
  }

  async function handleDeleteHistory(historyIndex: number) {
    if (
      !confirm(
        "Remove this parlay from history? Bankroll will be recalculated."
      )
    ) {
      return;
    }
    setLoading("delete");
    try {
      const res = await fetch("/api/history/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: historyIndex }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error ?? "Could not delete entry.");
        return;
      }
      if (data.state.history.length === 0) {
        setHistoryOpen(false);
        setHistoryVisibleCount(3);
      }
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  function toggleHistoryPanel() {
    if (historyOpen) {
      setHistoryOpen(false);
      setHistoryVisibleCount(3);
      setHistoryExpandedId(null);
    } else {
      setHistoryOpen(true);
      setHistoryVisibleCount(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const today = formatDisplayDate(getTodayEastern());

  return (
    <>
      {(booting || bootFading) && (
        <BootLoader progress={loadProgress} fadingOut={bootFading} />
      )}
    <main
      className={`mx-auto max-w-md px-4 pb-10 pt-6 transition-opacity duration-500 ${
        booting ? "opacity-0" : "opacity-100"
      }`}
    >
      <header className="mb-6 flex items-center justify-between text-sm text-[var(--text-muted)]">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
          5For5
        </h1>
        <span className="text-[var(--text-subtle)]">{today}</span>
      </header>

      <section className="mb-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition-[padding] duration-300">
        <div className="p-6 text-center">
          <p className="text-4xl font-semibold text-[var(--text)]">
            ${state?.bankroll.toFixed(2) ?? "—"}
          </p>
          {parlayRecord && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {parlayRecord.wins}–{parlayRecord.losses} W–L
              {parlayRecord.losses > 0 && (
                <span className="text-[var(--text-subtle)]">
                  {" "}
                  (
                  {(parlayRecord.wins / parlayRecord.losses).toFixed(1)}
                  :1)
                </span>
              )}
            </p>
          )}
          <p
            className={`mt-1 text-sm ${roiPositive ? "text-green-400" : "text-red-400"}`}
          >
            {roiPositive ? "+" : ""}
            {roi}% ROI · started $200
          </p>
          {historyNewestFirst.length > 0 && (
            <button
              type="button"
              onClick={toggleHistoryPanel}
              className="mt-4 text-sm font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {historyOpen ? "Hide History" : "View History"}
            </button>
          )}
        </div>

        {historyOpen && historyNewestFirst.length > 0 && (
          <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
            <ul className="space-y-2">
              {historyNewestFirst
                .slice(0, historyVisibleCount)
                .map((h, displayIndex) => {
                  const historyIndex =
                    (state?.history.length ?? 0) - 1 - displayIndex;
                  const cardId = `${h.date}-${historyIndex}`;
                  return (
                    <HistoryCard
                      key={cardId}
                      parlay={h}
                      expanded={historyExpandedId === cardId}
                      onToggle={() =>
                        setHistoryExpandedId((id) =>
                          id === cardId ? null : cardId
                        )
                      }
                      onDelete={() => handleDeleteHistory(historyIndex)}
                      deleteDisabled={!!loading}
                    />
                  );
                })}
            </ul>
            {historyVisibleCount < historyNewestFirst.length && (
              <button
                type="button"
                onClick={() =>
                  setHistoryVisibleCount((n) =>
                    Math.min(n + 3, historyNewestFirst.length)
                  )
                }
                className="mt-3 w-full py-2 text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
              >
                Show more (
                {historyNewestFirst.length - historyVisibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </section>

      {state?.slate && (
        <CollapsiblePanel
          title={`Tonight · ${formatDisplayDate(state.slate.date)}`}
          subtitle={`${state.slate.games.length} games`}
          open={showSlate}
          onToggle={() => setShowSlate((v) => !v)}
          className="mb-4"
        >
          <div className="text-sm">
            {state.slate.games.length === 0 ? (
              <p className="text-[var(--text-muted)]">No games scheduled today.</p>
            ) : (
              <ul className="space-y-1 text-[var(--text)]">
                {state.slate.games.map((g) => (
                  <li key={`${g.away}-${g.home}`}>
                    {g.away} @ {g.home}
                    <span className="ml-2 text-xs text-[var(--text-subtle)]">
                      {g.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              {state.slate.rosterCount} players
              {state.qualifiedCount != null
                ? ` · ${state.qualifiedCount} qualifying`
                : ""}
            </p>
          </div>
        </CollapsiblePanel>
      )}

      {rankedPicks.length > 0 && !state?.pending && (
        <RankedPicksPanel
          picks={rankedPicks}
          legCount={PARLAY_LEG_COUNT}
          selectedCount={selectedCount}
          onToggle={toggleRankedPick}
        />
      )}

      {draftMeta && !state?.pending && (
        <section className="mb-4 rounded-xl border border-green-800/50 bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-green-500">
              Ready to place · {formatDisplayDate(draftMeta.date)}
            </p>
            <span className="text-xs text-[var(--text-muted)]">
              {selectedCount}/{PARLAY_LEG_COUNT} legs · {draftMeta.confidence}
            </span>
          </div>
          <ul className="space-y-3">
            {selectedPicks.map((pick) => {
              const key = legKey(pick);
              const leg = rankedToLeg(pick);
              const entered = parseAmericanOdds(oddsByLeg[key] ?? "");
              const heavyFavorite =
                entered !== null && !passesOddsCap(entered);
              return (
                <li
                  key={key}
                  className={`rounded-lg border bg-[var(--bg-inset)] p-3 ${
                    heavyFavorite ? "border-amber-800/50" : "border-[var(--border-strong)]"
                  }`}
                >
                  <p className="text-sm text-[var(--text)]">
                    {leg.player}{" "}
                    <span className="text-[var(--text-muted)]">
                      {formatMilestoneLabel(leg.stat, leg.threshold)}
                    </span>
                  </p>
                  <FiveForFive values={leg.last5} />
                  <div
                    className={`mt-3 border-b pb-1 transition-colors ${
                      heavyFavorite
                        ? "border-amber-700/50 focus-within:border-amber-500"
                        : "border-[var(--border-strong)] focus-within:border-green-600"
                    }`}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                      FanDuel odds
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      value={oddsByLeg[key] ?? ""}
                      onChange={(e) => setOddsForLeg(key, e.target.value)}
                      placeholder="−280"
                      className="w-full bg-transparent py-1 font-mono text-lg text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
                      disabled={!!loading}
                    />
                  </div>
                  {heavyFavorite && (
                    <p className="mt-1.5 text-[10px] text-amber-400/90">
                      Heavier than -1200 — fine to play, but consider swapping
                      for a better parlay price.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-inset)] p-3 text-sm">
            <div className="flex justify-between text-[var(--text-muted)]">
              <span>Stake (auto)</span>
              <span className="font-semibold text-[var(--text)]">
                {draftMath?.valid ? `$${draftMath.stake}` : "—"}
              </span>
            </div>
            {draftMath?.valid && (
              <p className="text-xs text-[var(--text-subtle)]">{draftMath.tierLabel}</p>
            )}
            <div className="flex justify-between text-[var(--text-muted)]">
              <span>Parlay odds</span>
              <span className="font-mono text-[var(--text)]">
                {draftMath?.valid ? formatAmerican(draftMath.parlayOdds) : "—"}
              </span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)]">
              <span>To win</span>
              <span className="font-semibold text-green-400">
                {draftMath?.valid ? `$${draftMath.payout.toFixed(2)}` : "—"}
              </span>
            </div>
            {draftMath?.valid && draftMath.hasJuiceLeg && (
              <p className="text-xs text-amber-400/90">
                One or more legs are heavier than -1200. You can still place;
                swapping may improve combined odds.
              </p>
            )}
          </div>
          {placeError && (
            <p className="mt-2 text-xs text-red-400">{placeError}</p>
          )}
          <button
            type="button"
            onClick={handlePlace}
            disabled={
              !!loading ||
              selectedCount !== PARLAY_LEG_COUNT ||
              !draftMath?.valid
            }
            className="mt-4 min-h-12 w-full rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-[var(--text)] disabled:opacity-40"
          >
            {loading === "place" ? "Placing…" : "Place Parlay"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftMeta(null);
              setRankedPicks([]);
              setOddsByLeg({});
              setPlaceError(null);
            }}
            className="mt-2 w-full py-2 text-xs text-[var(--text-faint)] underline"
            disabled={!!loading}
          >
            Discard draft
          </button>
        </section>
      )}

      {state?.pending && (
        <section className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-yellow-500">
            Pending — {formatDisplayDate(state.pending.date)}
          </p>
          <p className="mb-3 text-xs leading-relaxed text-[var(--text-subtle)]">
            {settleLock ? settleLockHint(settleLock) : ""}
          </p>
          {settleLock?.legsStats && settleLock.legsStats.length > 0 && (
            <ul className="mb-3 space-y-1 text-[11px] text-[var(--text-muted)]">
              {settleLock.legsStats.map((leg) => (
                <li key={leg.player} className="flex justify-between gap-2">
                  <span>{leg.player}</span>
                  <span
                    className={
                      leg.ready ? "text-green-400" : "text-amber-400/90"
                    }
                  >
                    {leg.ready
                      ? `${leg.source ?? "?"} · ${leg.matchedDate}${leg.pts != null ? ` · ${leg.pts} pts` : ""}`
                      : leg.error === "player_not_found"
                        ? "not found in feed"
                        : "no box score yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <PendingCard parlay={state.pending} />
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!!loading || !!state?.pending || !!draftMeta}
          className="min-h-12 rounded-xl bg-green-700 px-4 py-3 text-sm font-semibold text-[var(--text)] disabled:opacity-40"
        >
          {loading === "create"
            ? scanProgress.total > 0
              ? `Scanning ${scanProgress.index}/${scanProgress.total}…`
              : "Building…"
            : state?.pending
              ? "Parlay pending"
              : draftMeta
                ? "Draft ready"
                : "Create Parlay"}
        </button>
        <button
          type="button"
          onClick={handleSettle}
          disabled={
            !!loading || !state?.pending || settleLock?.locked === true
          }
          className="min-h-12 rounded-xl bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border-strong)] disabled:opacity-40"
        >
          {loading === "settle"
            ? "Settling…"
            : settleLock
              ? settleButtonLabel(settleLock)
              : "Settle"}
        </button>
      </div>
      {state?.pending && settleLock?.locked && (
        <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
          {settleLockHint(settleLock)}
        </p>
      )}

      {!state?.pending && (state?.history.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={handleRevertSettle}
          disabled={!!loading}
          className="mb-4 w-full rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm font-medium text-amber-200/90 disabled:opacity-40"
        >
          {loading === "revert" ? "Reverting…" : "Revert last settle"}
        </button>
      )}

      {progressLines.length > 0 && (
        <CollapsiblePanel
          title="Discovery log"
          subtitle={
            scanProgress.total > 0
              ? `${scanProgress.index} / ${scanProgress.total} players`
              : undefined
          }
          open={showDiscoveryLog}
          onToggle={() => setShowDiscoveryLog((v) => !v)}
          className="mt-4"
        >
          {scanProgress.total > 0 && (
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full bg-green-600 transition-all duration-200"
                style={{
                  width: `${(scanProgress.index / scanProgress.total) * 100}%`,
                }}
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {progressLines.map((line) => (
              <p
                key={line.id}
                className={
                  line.kind === "ok"
                    ? "text-green-400"
                    : line.kind === "pick"
                      ? "text-yellow-300"
                      : line.kind === "skip"
                        ? "text-[var(--text-faint)]"
                        : line.kind === "warn"
                          ? "text-red-400"
                          : line.kind === "phase"
                            ? "text-[var(--text-muted)]"
                            : "text-[var(--text-muted)]"
                }
              >
                {line.text}
              </p>
            ))}
            <div ref={progressEndRef} />
          </div>
        </CollapsiblePanel>
      )}

      {message && (
        <CollapsiblePanel
          title="Scan report"
          open={showScanReport}
          onToggle={() => setShowScanReport((v) => !v)}
          className="mt-4"
        >
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text-muted)]">
            {message}
          </pre>
        </CollapsiblePanel>
      )}

      <button
        type="button"
        onClick={handleReset}
        className="mt-8 w-full py-2 text-xs text-[var(--text-faint)] underline"
      >
        Reset simulation
      </button>
    </main>
    </>
  );
}

function CollapsiblePanel({
  title,
  subtitle,
  open,
  onToggle,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--border-strong)] bg-[var(--bg-inset)] p-3 ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-subtle)]">
          {subtitle && <span>{subtitle}</span>}
          <span>{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function RankedPicksPanel({
  picks,
  legCount,
  selectedCount,
  onToggle,
}: {
  picks: RankedPick[];
  legCount: number;
  selectedCount: number;
  onToggle: (rank: number) => void;
}) {
  const atCapacity = selectedCount >= legCount;
  return (
    <section className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Ranked picks
        </p>
        <span
          className={`text-xs font-medium ${
            selectedCount === legCount ? "text-green-500" : "text-yellow-500"
          }`}
        >
          {selectedCount}/{legCount} selected
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-subtle)]">
        Top {legCount} are selected by default. Tap a selected row to remove it,
        then tap another to add it to your parlay.
        {atCapacity && (
          <span className="text-[var(--text-faint)]"> Deselect one first to swap.</span>
        )}
      </p>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {picks.map((pick) => {
          const canSelect = pick.selected || !atCapacity;
          return (
            <li key={`${pick.rank}-${pick.player}-${pick.stat}`}>
              <button
                type="button"
                onClick={() => onToggle(pick.rank)}
                disabled={!pick.selected && !canSelect}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  pick.selected
                    ? "border-[var(--accent)]/40 bg-[var(--accent-bg)]"
                    : canSelect
                      ? "border-[var(--border)] bg-[var(--bg-inset)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
                      : "cursor-not-allowed border-[var(--border)] bg-[var(--bg)] opacity-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span
                      className={
                        pick.selected
                          ? "font-semibold text-green-400"
                          : "text-[var(--text-muted)]"
                      }
                    >
                      #{pick.rank} {pick.player}
                    </span>
                    <span className="ml-1 text-[var(--text-subtle)]">({pick.team})</span>
                    <p className="mt-0.5 text-[var(--text)]">
                      {formatMilestoneLabel(pick.stat, pick.threshold)}
                    </p>
                    <FiveForFive values={pick.last5} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        pick.selected ? "text-green-400" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {pick.score.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-[var(--text-faint)]">score</p>
                  </div>
                </div>
                <p
                  className={`mt-1 text-[10px] font-medium uppercase ${
                    pick.selected ? "text-green-500" : "text-[var(--text-faint)]"
                  }`}
                >
                  {pick.selected ? "Selected · tap to remove" : "Tap to add"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PendingCard({ parlay }: { parlay: PendingParlay }) {
  return (
    <div className="space-y-2 text-sm">
      {parlay.legs.map((leg) => (
        <div key={`${leg.player}-${leg.stat}`} className="text-[var(--text)]">
          <span className="text-green-400">✦</span> {leg.player}{" "}
          {formatMilestoneLabel(leg.stat, leg.threshold)}{" "}
          <span className="text-[var(--text-muted)]">{formatAmerican(leg.odds)}</span>
          <FiveForFive values={leg.last5} />
        </div>
      ))}
      <p className="pt-2 text-xs text-[var(--text-muted)]">
        Stake ${parlay.stake} · {formatAmerican(parlay.parlayOdds)} · To win $
        {parlay.potentialPayout.toFixed(2)} · {parlay.confidence}
      </p>
    </div>
  );
}

function HistoryCard({
  parlay,
  expanded,
  onToggle,
  onDelete,
  deleteDisabled,
}: {
  parlay: SettledParlay;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  const win = parlay.result === "win";
  return (
    <li className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-inset)]">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-sm text-[var(--text)]">
            {formatDisplayDate(parlay.date)}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${win ? "bg-green-900/80 text-green-400" : "bg-red-900/80 text-red-400"}`}
            >
              {win ? "Win" : "Loss"}
            </span>
            <span
              className={`text-sm font-medium ${win ? "text-green-400" : "text-red-400"}`}
            >
              {win ? "+" : ""}${parlay.profit.toFixed(2)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={deleteDisabled}
          className="border-l border-[var(--border-strong)] px-3 text-xs text-[var(--text-faint)] hover:text-red-400 disabled:opacity-40"
          aria-label="Delete parlay from history"
        >
          Delete
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {parlay.legs.map((leg) => (
            <p key={`${leg.player}-${leg.stat}`}>
              {leg.hit ? "✅" : "❌"} {leg.player}{" "}
              {formatMilestoneLabel(leg.stat, leg.threshold)} → {leg.actualValue}
            </p>
          ))}
          {parlay.failureAnalysis && (
            <p className="mt-2 text-[var(--text-muted)]">{parlay.failureAnalysis}</p>
          )}
        </div>
      )}
    </li>
  );
}
