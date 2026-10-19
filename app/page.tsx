"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
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
  parseAmericanOdds,
  passesOddsCap,
  stakeTierForRisk,
  stakeTierLabel,
  weakestStakeTier,
  type RiskPreference,
  type StakeTier,
} from "@/lib/odds";
import type {
  CreateProgressEvent,
  RankedPick,
} from "@/lib/discovery-progress";
import {
  defaultSelectedRanked,
  legKey,
  rankedToLeg,
} from "@/lib/parlay-selection";
import { PARLAY_LEG_COUNT } from "@/lib/scoring";
import { AuthButton } from "@/components/auth-button";
import { AuthLanding } from "@/components/auth-landing";
import { BootLoader } from "@/components/boot-loader";
import { LeaderboardView } from "@/components/leaderboard-view";
import {
  ParlayButtonSpinner,
  ParlayFlowStatus,
} from "@/components/parlay-flow-status";
import { DiscoveryInfoModal } from "@/components/discovery-info-modal";
import { WeekRecord } from "@/components/week-record";
import { BottomNav, type AppTab } from "@/components/bottom-nav";
import { ResultsView } from "@/components/results-view";
import { DateStrip } from "@/components/date-strip";
import { SlateGamesList } from "@/components/slate-games-list";
import {
  SlateBrowser,
  type BrowseCandidate,
} from "@/components/slate-browser";
import { ParlaySheet } from "@/components/parlay-sheet";
import { PlayerAvatar } from "@/components/player-avatar";
import { RiskSheet } from "@/components/risk-sheet";
import { formatDisplayDate, getTodayEastern } from "@/lib/dates";
import { hasSlipForDate, pendingForDate } from "@/lib/pending";
import { buildWeekRecord, upcomingSlateDates } from "@/lib/week-record";
import { gameKey } from "@/lib/slate-games";
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
  stat: ParlayLeg["stat"];
  threshold: number;
  ready: boolean;
  source: string | null;
  matchedDate: string | null;
  actualValue: number | null;
  hit: boolean | null;
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
  settleLocks?: Record<string, SettleLockInfo>;
  storage?: "redis" | "local" | "none";
  storageOk?: boolean;
  storageDetail?: string;
  account?: {
    signedIn: boolean;
    authEnabled: boolean;
    id?: string;
    name?: string;
    email?: string;
    image?: string;
    handle?: string;
  };
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
  const [historyVisibleCount, setHistoryVisibleCount] = useState(3);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(
    null
  );
  const [deselectedGameKeys, setDeselectedGameKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [statsReady, setStatsReady] = useState(false);
  const [slateLoading, setSlateLoading] = useState(false);
  /** When true, auto-select top 5 into the sheet after discovery. */
  const suggestTop5Ref = useRef(false);
  const riskPreferenceRef = useRef<RiskPreference>("LOW");
  const [riskPreference, setRiskPreference] = useState<RiskPreference | null>(
    null
  );
  const [riskSheetOpen, setRiskSheetOpen] = useState(false);
  /** Suggest 5 UX: sheet open with skeletons while discovery runs. */
  const [suggesting, setSuggesting] = useState(false);
  const createAbortRef = useRef<AbortController | null>(null);
  /** Restore browse stats if Suggest 5 is cancelled mid-run. */
  const suggestSnapshotRef = useRef<{
    pool: BrowseCandidate[];
    ready: boolean;
    ranked: RankedPick[];
  } | null>(null);
  const [h2hMode, setH2hMode] = useState(false);
  const [createOptsOpen, setCreateOptsOpen] = useState(false);
  const [appTab, setAppTab] = useState<AppTab>("home");
  const [stake, setStake] = useState<StakeTier>(2);
  const [discoveryInfoOpen, setDiscoveryInfoOpen] = useState(false);
  const [progressLines, setProgressLines] = useState<ProgressLine[]>([]);
  const [rankedPicks, setRankedPicks] = useState<RankedPick[]>([]);
  const [draftMeta, setDraftMeta] = useState<{
    date: string;
    confidence: ParlayDraft["confidence"];
  } | null>(null);
  const [oddsByLeg, setOddsByLeg] = useState<Record<string, string>>({});
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ index: 0, total: 0 });
  const [showDiscoveryLog, setShowDiscoveryLog] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [booting, setBooting] = useState(true);
  const [bootFading, setBootFading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [viewDate, setViewDate] = useState(() => getTodayEastern());
  const [candidatePool, setCandidatePool] = useState<BrowseCandidate[]>([]);
  const progressEndRef = useRef<HTMLDivElement>(null);
  const viewDateRef = useRef(viewDate);
  viewDateRef.current = viewDate;

  function hydrateSettleLock(raw: SettleLockInfo | null | undefined) {
    if (!raw) return null;
    const timeRemainingMs =
      raw.unlockAt != null
        ? Math.max(0, new Date(raw.unlockAt).getTime() - clockMs)
        : 0;
    const waitingPlayers =
      raw.legsStats?.filter((l) => !l.ready).map((l) => l.player) ?? [];
    return {
      ...raw,
      remainingMs:
        raw.lockReason === "waiting_games" || raw.lockReason === "deferred"
          ? timeRemainingMs
          : raw.remainingMs,
      waitingPlayers,
    };
  }

  const settleLock = useMemo(
    () => hydrateSettleLock(state?.settleLock),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clockMs drives countdown
    [state?.settleLock, clockMs]
  );

  const settleLocksByDate = useMemo(() => {
    const map = state?.settleLocks ?? {};
    const out: Record<string, NonNullable<ReturnType<typeof hydrateSettleLock>>> =
      {};
    for (const [date, raw] of Object.entries(map)) {
      const hydrated = hydrateSettleLock(raw);
      if (hydrated) out[date] = hydrated;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.settleLocks, clockMs]);

  useEffect(() => {
    if (!state?.pending?.length) return;
    const tick = setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [state?.pending]);

  function collapseScanSections() {
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

  const recommendedStake: StakeTier | null = riskPreference
    ? stakeTierForRisk(riskPreference)
    : draftMath?.valid
      ? (draftMath.stake as StakeTier)
      : null;

  useEffect(() => {
    if (recommendedStake != null) setStake(recommendedStake);
  }, [recommendedStake]);

  function toggleBrowseCandidate(c: BrowseCandidate) {
    const key = legKey(c);
    const ps = `${c.player}|${c.stat}`;
    setPlaceError(null);
    setRankedPicks((prev) => {
      const idx = prev.findIndex((p) => legKey(p) === key);
      if (idx >= 0) {
        const currentlyOn = prev[idx].selected;
        if (currentlyOn) {
          return prev.map((p, i) =>
            i === idx ? { ...p, selected: false } : p
          );
        }
        // Selecting this leg: drop any other threshold for same player+stat.
        const next = prev.map((p) =>
          `${p.player}|${p.stat}` === ps && legKey(p) !== key
            ? { ...p, selected: false }
            : p
        );
        const selectedCount = next.filter((p) => p.selected).length;
        if (selectedCount >= PARLAY_LEG_COUNT) return prev;
        return next.map((p, i) =>
          i === idx ? { ...p, selected: true } : p
        );
      }
      const withoutCategory = prev.map((p) =>
        `${p.player}|${p.stat}` === ps ? { ...p, selected: false } : p
      );
      const selectedCount = withoutCategory.filter((p) => p.selected).length;
      if (selectedCount >= PARLAY_LEG_COUNT) return prev;
      const pick: RankedPick = {
        player: c.player,
        team: c.team,
        stat: c.stat,
        threshold: c.threshold,
        score: c.score,
        rank: withoutCategory.length + 1,
        odds: c.odds,
        last5: c.last5,
        buffer: c.buffer,
        espnAthleteId: c.espnAthleteId,
        selected: true,
      };
      return [...withoutCategory, pick];
    });
  }

  function restoreSuggestSnapshot() {
    const snap = suggestSnapshotRef.current;
    suggestSnapshotRef.current = null;
    if (!snap) return false;
    setCandidatePool(snap.pool);
    setStatsReady(snap.ready || snap.pool.length > 0);
    setRankedPicks(snap.ranked.map((p) => ({ ...p, selected: false })));
    return true;
  }

  function discardDraft() {
    createAbortRef.current?.abort();
    createAbortRef.current = null;
    setSuggesting(false);
    setLoading(null);
    setDraftMeta(null);
    setOddsByLeg({});
    setPlaceError(null);
    setRiskPreference(null);
    riskPreferenceRef.current = "LOW";
    if (!restoreSuggestSnapshot()) {
      setRankedPicks((prev) => prev.map((p) => ({ ...p, selected: false })));
    }
  }

  function startSuggestWithRisk(risk: RiskPreference) {
    setRiskSheetOpen(false);
    setRiskPreference(risk);
    riskPreferenceRef.current = risk;
    setStake(stakeTierForRisk(risk));
    void handleCreate({ suggestTop5: true });
  }

  function setOddsForLeg(key: string, value: string) {
    setOddsByLeg((prev) => ({ ...prev, [key]: value }));
    setPlaceError(null);
  }

  const fetchStatus = useCallback(
    async (opts?: { silent?: boolean; date?: string; fresh?: boolean }) => {
      const silent = opts?.silent ?? false;
      const date = opts?.date;
      const fresh = opts?.fresh ?? false;
      let tick: ReturnType<typeof setInterval> | undefined;
      if (!silent) {
        tick = setInterval(() => {
          setLoadProgress((p) => (p >= 88 ? p : p + 4));
        }, 60);
      }
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 12_000);
      try {
        const qs = new URLSearchParams();
        // Omit date on boot so the server can advance past off-nights.
        if (date) qs.set("date", date);
        else qs.set("date", viewDateRef.current);
        // Only auto-advance when caller didn't pin a calendar night.
        if (!opts?.date) qs.set("advance", "1");
        if (fresh) qs.set("fresh", "1");
        const res = await fetch(`/api/status?${qs.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!data?.slate) {
          throw new Error(
            data?.error || `status ${res.status || "failed"}`
          );
        }
        setState(data);
        // Only clear sticky error once we have real games (or an intentional empty night).
        if (data.slate.games?.length > 0 || res.ok) {
          setMessage(null);
        }
        // Keep date strip in sync when server skipped an empty night.
        if (
          !opts?.date &&
          typeof data.slate.date === "string" &&
          data.slate.date !== viewDateRef.current
        ) {
          setViewDate(data.slate.date);
          viewDateRef.current = data.slate.date;
        }
      } catch (err) {
        console.error("status fetch failed", err);
        if (!silent) {
          setMessage("Couldn't load slate — check the connection and refresh.");
        }
      } finally {
        clearTimeout(abortTimer);
        if (tick) clearInterval(tick);
        setSlateLoading(false);
        if (!silent) {
          setLoadProgress(100);
          setBootFading(true);
          await new Promise((r) => setTimeout(r, 220));
          setBooting(false);
          setBootFading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function handleViewDateChange(ymd: string) {
    if (ymd === viewDate) return;
    setViewDate(ymd);
    setSlateLoading(true);
    setCandidatePool([]);
    setRankedPicks([]);
    setDraftMeta(null);
    setOddsByLeg({});
    setPlaceError(null);
    setDeselectedGameKeys(new Set());
    setStatsReady(false);
    // Clear stale games so we don't show yesterday's slate under today's label.
    setState((prev) =>
      prev?.slate
        ? {
            ...prev,
            slate: {
              ...prev.slate,
              date: ymd,
              games: [],
              rosterCount: 0,
            },
          }
        : prev
    );
    await fetchStatus({ date: ymd, silent: true, fresh: true });
  }

  useEffect(() => {
    if (!state?.pending?.length) return;
    const id = setInterval(() => {
      void fetchStatus({ silent: true, date: viewDateRef.current });
    }, 8_000);
    return () => clearInterval(id);
  }, [state?.pending, fetchStatus]);

  const historyNewestFirst = useMemo(
    () => (state?.history ? [...state.history].reverse() : []),
    [state?.history]
  );

  const parlayRecord = useMemo(() => {
    if (!state?.history.length) return null;
    const wins = state.history.filter((h) => h.result === "win").length;
    const losses = state.history.length - wins;
    return { wins, losses };
  }, [state?.history]);

  const weekDays = useMemo(
    () => buildWeekRecord(state?.history ?? [], getTodayEastern()),
    [state?.history]
  );

  const slateDates = useMemo(() => upcomingSlateDates(getTodayEastern(), 8), []);

  const selectedKeys = useMemo(
    () => new Set(selectedPicks.map((p) => legKey(p))),
    [selectedPicks]
  );

  const selectedPlayerStats = useMemo(
    () => new Set(selectedPicks.map((p) => `${p.player}|${p.stat}`)),
    [selectedPicks]
  );

  const sheetGameCount = useMemo(() => {
    const teams = new Set(selectedPicks.map((p) => p.team.toUpperCase()));
    if (!state?.slate?.games.length) return teams.size;
    let count = 0;
    for (const g of state.slate.games) {
      if (
        teams.has(g.home.toUpperCase()) ||
        teams.has(g.away.toUpperCase())
      ) {
        count += 1;
      }
    }
    return count || teams.size;
  }, [selectedPicks, state?.slate?.games]);

  const includedGames = useMemo(() => {
    if (!state?.slate?.games.length) return [];
    return state.slate.games.filter((g) => !deselectedGameKeys.has(gameKey(g)));
  }, [state?.slate?.games, deselectedGameKeys]);

  useEffect(() => {
    setDeselectedGameKeys(new Set());
  }, [state?.slate?.date]);

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
        if (event.status === "qualified" && event.milestones?.length) {
          setCandidatePool((prev) => {
            const next = [...prev];
            for (const m of event.milestones!) {
              const row: BrowseCandidate = {
                player: event.player,
                team: event.team,
                stat: m.stat,
                threshold: m.threshold,
                last5: m.last5,
                score: m.score,
                odds: m.odds,
                buffer: m.buffer,
                espnAthleteId: event.espnAthleteId,
              };
              const key = legKey(row);
              if (!next.some((c) => legKey(c) === key)) next.push(row);
            }
            return next;
          });
          for (const m of event.milestones) {
            const label = formatMilestoneLabel(m.stat, m.threshold);
            const h2h =
              m.h2hGate && m.h2hLine
                ? ` · ${m.h2hGate} · H2H ${m.h2hLine}`
                : "";
            pushProgress(
              `✓ ${event.player} → ${label} 5/5 [${m.last5.join(", ")}] · score ${m.score.toFixed(2)}${h2h}`,
              "ok"
            );
          }
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
        if (event.qualified > 0) setStatsReady(true);
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
        const pickTop = suggestTop5Ref.current;
        const ranked = defaultSelectedRanked(
          event.ranked.map((r) => ({
            ...r,
            selected: false,
          })),
          pickTop ? event.parlayLegCount : 0,
          riskPreferenceRef.current
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
        setStatsReady(true);
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

  function toggleH2hAndRetrieve() {
    const next = !h2hMode;
    setH2hMode(next);
    setCreateOptsOpen(false);
    void handleCreate({ suggestTop5: false, h2hMode: next });
  }

  async function handleCreate(opts?: {
    suggestTop5?: boolean;
    h2hMode?: boolean;
  }) {
    const suggestTop5 = opts?.suggestTop5 ?? true;
    const h2h = opts?.h2hMode ?? h2hMode;
    suggestTop5Ref.current = suggestTop5;
    createAbortRef.current?.abort();
    const ac = new AbortController();
    createAbortRef.current = ac;
    setCreateOptsOpen(false);
    setLoading("create");
    setMessage(null);
    setProgressLines([]);
    setDraftMeta(null);
    setOddsByLeg({});
    setPlaceError(null);
    setScanProgress({ index: 0, total: 0 });
    setShowDiscoveryLog(false);

    if (suggestTop5) {
      suggestSnapshotRef.current = {
        pool: candidatePool,
        ready: statsReady,
        ranked: rankedPicks,
      };
      setSuggesting(true);
      // Keep retrieved browse stats visible; only clear leg selections.
      setRankedPicks((prev) => prev.map((p) => ({ ...p, selected: false })));
    } else {
      suggestSnapshotRef.current = null;
      setRankedPicks([]);
      setCandidatePool([]);
      setStatsReady(false);
    }

    pushProgress("Scanning slate for qualifying legs…", "phase");

    try {
      const res = await fetch("/api/parlay/create/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          date: viewDate,
          includedGames: includedGames.map((g) => ({
            away: g.away,
            home: g.home,
          })),
          h2hMode: h2h,
        }),
      });

      if (!res.ok || !res.body) {
        setMessage("Create failed — bad response from server.");
        if (suggestTop5) restoreSuggestSnapshot();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (ac.signal.aborted) break;
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

      if (!ac.signal.aborted) {
        suggestSnapshotRef.current = null;
        await fetchStatus();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        restoreSuggestSnapshot();
        return;
      }
      setMessage(
        err instanceof Error
          ? `Create failed: ${err.message}`
          : "Create failed. Check the terminal for errors."
      );
      if (suggestTop5) restoreSuggestSnapshot();
    } finally {
      if (createAbortRef.current === ac) createAbortRef.current = null;
      setLoading(null);
      setSuggesting(false);
      if (ac.signal.aborted) restoreSuggestSnapshot();
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

    const rankedPool = rankedPicks.map((r) => ({
      player: r.player,
      team: r.team,
      stat: r.stat,
      threshold: r.threshold,
      rank: r.rank,
      inParlay: r.selected,
    }));

    try {
      const res = await fetch("/api/parlay/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: draftMeta.date,
          legs,
          rankedPool,
          stake,
        }),
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
        "Revert the last settled parlay? It will return to pending, net will be restored, and settle will stay locked until tomorrow morning (2:30 AM ET)."
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

  async function handleCancelPending(date: string) {
    if (
      !confirm(
        "Cancel this pending parlay? The open stake will be cleared from your net."
      )
    ) {
      return;
    }
    setLoading("cancel");
    setMessage(null);
    try {
      const res = await fetch("/api/parlay/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (data.message) setMessage(data.message);
      if (data.error) setMessage(data.error ?? data.message);
      await fetchStatus();
    } catch {
      setMessage("Cancel parlay failed. Try again.");
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  async function handleSettle(date: string) {
    setLoading("settle");
    setMessage(null);
    try {
      const res = await fetch("/api/parlay/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (data.message) setMessage(data.message);
      if (data.error) setMessage(data.error);
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  async function handleReset() {
    if (!confirm("Clear all history and reset tracker state?")) return;
    await fetch("/api/reset", { method: "POST" });
    setMessage(null);
    setHistoryVisibleCount(3);
    setStatsReady(false);
    setCandidatePool([]);
    setRankedPicks([]);
    setDraftMeta(null);
    await fetchStatus();
  }

  async function handleBackfillHistoryRanked(historyIndex: number) {
    setLoading("backfill");
    setMessage(null);
    try {
      const res = await fetch("/api/history/backfill-ranked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: historyIndex }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error ?? "Could not load ranked results.");
        return;
      }
      await fetchStatus();
    } catch {
      setMessage("Could not load ranked results. Try again.");
    } finally {
      setLoading(null);
    }
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
        setHistoryVisibleCount(3);
      }
      await fetchStatus();
    } finally {
      setLoading(null);
    }
  }

  const viewPending = useMemo(
    () => (state ? pendingForDate(state, viewDate) : null),
    [state, viewDate]
  );
  const viewHasSlip = useMemo(
    () => (state ? hasSlipForDate(state, viewDate) : false),
    [state, viewDate]
  );
  useEffect(() => {
    if (viewPending) return;
    if (selectedCount > 0) {
      setDraftMeta((m) => m ?? { date: viewDate, confidence: "MEDIUM" });
    } else {
      setDraftMeta(null);
    }
  }, [selectedCount, viewPending, viewDate]);

  const browsePool = useMemo(() => {
    if (candidatePool.length > 0) return candidatePool;
    return rankedPicks.map((p) => ({
      player: p.player,
      team: p.team,
      stat: p.stat,
      threshold: p.threshold,
      last5: p.last5,
      score: p.score,
      odds: p.odds,
      buffer: p.buffer,
      espnAthleteId: p.espnAthleteId,
    }));
  }, [candidatePool, rankedPicks]);

  const showBrowser =
    statsReady &&
    browsePool.length > 0 &&
    !viewPending &&
    !viewHasSlip &&
    loading !== "place";

  const needsAuthGate =
    !booting &&
    Boolean(state?.account?.authEnabled) &&
    !state?.account?.signedIn;

  if (needsAuthGate) {
    return (
      <>
        {(booting || bootFading) && (
          <BootLoader progress={loadProgress} fadingOut={bootFading} />
        )}
        <AuthLanding />
      </>
    );
  }

  return (
    <>
      {(booting || bootFading) && (
        <BootLoader progress={loadProgress} fadingOut={bootFading} />
      )}
    <main
      className={`mx-auto max-w-md px-4 pt-6 transition-opacity duration-500 ${
        appTab === "home" &&
        (selectedCount > 0 || suggesting) &&
        !viewPending
          ? "pb-44"
          : "pb-28"
      } ${booting ? "opacity-0" : "opacity-100"}`}
    >
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
          {appTab === "home"
            ? "5For5"
            : appTab === "community"
              ? "Community"
              : "Results"}
        </h1>
        <AuthButton authEnabled={state?.account?.authEnabled !== false} />
      </header>

      {appTab === "community" && (
        <LeaderboardView
          signedIn={Boolean(state?.account?.signedIn)}
          authEnabled={state?.account?.authEnabled !== false}
        />
      )}

      {appTab === "results" && (
        <ResultsView
          net={state?.bankroll ?? 0}
          history={historyNewestFirst}
          pending={state?.pending ?? []}
          pendingSection={
            <div className="space-y-3">
              {(state?.pending ?? []).map((p) => {
                const lock = settleLocksByDate[p.date] ?? null;
                return (
                  <div
                    key={`${p.date}-${p.stake}-${p.parlayOdds}`}
                    className="parlay-pending-frame"
                  >
                    <section
                      className={`parlay-pending-inner p-4 transition-opacity duration-300 ${
                        loading === "settle"
                          ? "pointer-events-none opacity-55"
                          : ""
                      }`}
                    >
                      {lock && (
                        <p className="mb-3 text-xs leading-relaxed text-[var(--text-subtle)]">
                          {settleLockHint(lock)}
                        </p>
                      )}
                      <PendingCard parlay={p} />
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => handleSettle(p.date)}
                          disabled={!!loading || lock?.locked !== false}
                          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          {loading === "settle" && <ParlayButtonSpinner />}
                          {loading === "settle"
                            ? "Settling…"
                            : lock
                              ? settleButtonLabel(lock)
                              : "Settle"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelPending(p.date)}
                          disabled={!!loading}
                          className="flex min-h-12 w-full items-center justify-center rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 disabled:opacity-40"
                        >
                          {loading === "cancel" ? "Cancelling…" : "Cancel"}
                        </button>
                      </div>
                    </section>
                  </div>
                );
              })}
            </div>
          }
        >
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
                    onBackfillRanked={() =>
                      handleBackfillHistoryRanked(historyIndex)
                    }
                    backfillDisabled={!!loading}
                    onRevert={
                      !(state?.pending ?? []).some((p) => p.date === h.date) &&
                      historyIndex === (state?.history.length ?? 0) - 1
                        ? handleRevertSettle
                        : undefined
                    }
                    revertDisabled={loading === "revert"}
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
        </ResultsView>
      )}

      {appTab === "home" && (
        <>
      <WeekRecord
        days={weekDays}
        lifetime={parlayRecord}
        onOpenHistory={
          historyNewestFirst.length > 0
            ? () => {
                setAppTab("results");
                setHistoryVisibleCount(Math.max(historyVisibleCount, 5));
              }
            : undefined
        }
      />

      <DateStrip
        dates={slateDates}
        selected={viewDate}
        onSelect={(ymd) => void handleViewDateChange(ymd)}
        disabled={!!loading || slateLoading}
      />

      {state?.storageOk === false && (
        <div
          className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
          role="alert"
        >
          <p className="font-semibold">Database unreachable</p>
          <p className="mt-0.5 text-red-600/90">
            {state.storageDetail ??
              "Reconnect Upstash Redis in Vercel → Storage, then Redeploy."}
          </p>
        </div>
      )}

      <SlateGamesList
        games={state?.slate?.date === viewDate ? state.slate.games : []}
        loading={slateLoading || (booting && !state?.slate)}
      />

      {!viewPending && !viewHasSlip && !showBrowser && (
        <div className="relative mb-3 flex gap-2">
          {createOptsOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close options"
                onClick={() => setCreateOptsOpen(false)}
              />
              <div
                className="opts-menu-panel absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-lg ring-1 ring-black/10"
                role="dialog"
                aria-label="Discovery options"
              >
                <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                  Discovery
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={h2hMode}
                  onClick={toggleH2hAndRetrieve}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 active:bg-[var(--bg-inset)]"
                >
                  <span className="text-left text-sm text-[var(--text)]">H2H</span>
                  <span
                    className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
                      h2hMode ? "bg-green-600" : "bg-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        h2hMode ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiscoveryInfoOpen(true)}
                  className="mt-0.5 flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm text-[var(--text-muted)] active:bg-[var(--bg-inset)] hover:text-[var(--text)]"
                >
                  More information
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => void handleCreate({ suggestTop5: false })}
            disabled={!!loading}
            className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading === "create"
              ? scanProgress.total > 0
                ? `Scanning ${scanProgress.index}/${scanProgress.total}…`
                : "Retrieving…"
              : "Retrieve stats"}
          </button>
          <button
            type="button"
            onClick={() => setCreateOptsOpen((o) => !o)}
            disabled={!!loading}
            aria-expanded={createOptsOpen}
            aria-label="Discovery options"
            className={`relative flex min-h-12 min-w-12 items-center justify-center rounded-full bg-black text-white disabled:opacity-40 ${
              createOptsOpen ? "ring-2 ring-black/30" : ""
            }`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="12" cy="5" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="12" cy="19" r="1.75" />
            </svg>
            {h2hMode && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-black" />
            )}
          </button>
        </div>
      )}

      {showBrowser && (
        <SlateBrowser
          games={state?.slate?.games ?? []}
          candidates={browsePool}
          selectedKeys={selectedKeys}
          selectedPlayerStats={selectedPlayerStats}
          maxLegs={PARLAY_LEG_COUNT}
          onToggle={toggleBrowseCandidate}
          disabled={!!loading}
          scanning={loading === "create"}
        />
      )}

      {showBrowser && (
        <div className="relative mb-3 space-y-2">
          {createOptsOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close options"
                onClick={() => setCreateOptsOpen(false)}
              />
              <div
                className="opts-menu-panel absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-lg ring-1 ring-black/10"
                role="dialog"
                aria-label="Discovery options"
              >
                <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                  Discovery
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={h2hMode}
                  onClick={toggleH2hAndRetrieve}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 active:bg-[var(--bg-inset)]"
                >
                  <span className="text-left text-sm text-[var(--text)]">H2H</span>
                  <span
                    className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
                      h2hMode ? "bg-green-600" : "bg-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                        h2hMode ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiscoveryInfoOpen(true)}
                  className="mt-0.5 flex min-h-11 w-full items-center rounded-lg px-2 text-left text-sm text-[var(--text-muted)] active:bg-[var(--bg-inset)] hover:text-[var(--text)]"
                >
                  More information
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setRiskSheetOpen(true)}
            disabled={!!loading}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {suggesting
              ? "Generating…"
              : loading === "create"
                ? scanProgress.total > 0
                  ? `Scanning ${scanProgress.index}/${scanProgress.total}…`
                  : "Building…"
                : "Suggest 5"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate({ suggestTop5: false })}
              disabled={!!loading}
              className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-[var(--border-strong)] bg-white px-5 py-3 text-sm font-semibold text-[var(--text)] disabled:opacity-40"
            >
              {loading === "create" && !suggesting
                ? scanProgress.total > 0
                  ? `Scanning ${scanProgress.index}/${scanProgress.total}…`
                  : "Retrieving…"
                : "Retrieve stats"}
            </button>
            <button
              type="button"
              onClick={() => setCreateOptsOpen((o) => !o)}
              disabled={!!loading}
              aria-expanded={createOptsOpen}
              aria-label="Discovery options"
              className={`relative flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-white text-[var(--text)] disabled:opacity-40 ${
                createOptsOpen ? "ring-2 ring-black/20" : ""
              }`}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <circle cx="12" cy="5" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="12" cy="19" r="1.75" />
              </svg>
              {h2hMode && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-green-400 ring-2 ring-white" />
              )}
            </button>
          </div>
        </div>
      )}

      {!viewPending && !viewHasSlip && (suggesting || selectedCount > 0) && (
        <ParlaySheet
          picks={selectedPicks}
          maxLegs={PARLAY_LEG_COUNT}
          oddsByLeg={oddsByLeg}
          onOddsChange={setOddsForLeg}
          draftMath={draftMath}
          placeError={placeError}
          onPlace={handlePlace}
          onDiscard={discardDraft}
          loading={loading === "place"}
          generating={suggesting && selectedCount === 0}
          gameCount={sheetGameCount}
          games={state?.slate?.games ?? []}
          stake={stake}
          onStakeChange={setStake}
        />
      )}

      <ParlayFlowStatus phase={loading === "settle" ? "settle" : null} />

      {viewPending && (
        <div
          key={`${viewPending.date}-${viewPending.stake}-${viewPending.parlayOdds}`}
          className="parlay-pending-frame mb-4"
        >
          <section
            className={`parlay-pending-inner parlay-pending-inner-enter p-4 transition-opacity duration-300 ${
              loading === "settle" ? "pointer-events-none opacity-55" : ""
            }`}
          >
            {settleLock && (
              <p className="mb-3 text-xs leading-relaxed text-[var(--text-subtle)]">
                {settleLockHint(settleLock)}
              </p>
            )}
            <PendingCard parlay={viewPending} />
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => handleSettle(viewPending.date)}
                disabled={!!loading || settleLock?.locked !== false}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-black px-3 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {loading === "settle" && <ParlayButtonSpinner />}
                {loading === "settle"
                  ? "Settling…"
                  : settleLock
                    ? settleButtonLabel(settleLock)
                    : "Settle"}
              </button>
              <button
                type="button"
                onClick={() => handleCancelPending(viewPending.date)}
                disabled={!!loading}
                className="flex min-h-12 w-full items-center justify-center rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 disabled:opacity-40"
              >
                {loading === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          </section>
        </div>
      )}

      {!viewPending && viewHasSlip && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Slip already settled for {formatDisplayDate(viewDate)}. Pick another
          night to build a new one.
        </p>
      )}

      <ParlayFlowStatus phase={loading === "place" ? "place" : null} />

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
          progress={
            scanProgress.total > 0
              ? scanProgress.index / scanProgress.total
              : undefined
          }
        >
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

      {message && appTab === "home" && (
        <p className="mb-3 text-center text-sm text-[var(--text-muted)]">
          {message}
        </p>
      )}
        </>
      )}

    </main>
      <BottomNav tab={appTab} onChange={setAppTab} />
      <RiskSheet
        open={riskSheetOpen}
        onClose={() => setRiskSheetOpen(false)}
        onPick={startSuggestWithRisk}
      />
      <DiscoveryInfoModal
        open={discoveryInfoOpen}
        onClose={() => setDiscoveryInfoOpen(false)}
        onReset={handleReset}
        resetDisabled={!!loading}
      />
    </>
  );
}

function CollapsiblePanel({
  title,
  subtitle,
  open,
  onToggle,
  className = "",
  progress,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  /** 0–1 progress shown even when collapsed (discovery scan). */
  progress?: number;
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
        aria-expanded={open}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-subtle)]">
          {subtitle && <span>{subtitle}</span>}
          <EyeIcon open={open} />
        </span>
      </button>
      {progress != null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full bg-green-600 transition-all duration-200"
            style={{
              width: `${Math.min(100, Math.max(0, progress * 100))}%`,
            }}
          />
        </div>
      )}
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden
      >
        <path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M1 1l22 22" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PendingCard({ parlay }: { parlay: PendingParlay }) {
  const n = parlay.legs.length;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--text)]">
          {n}-Leg Parlay
          <span className="font-normal text-[var(--text-muted)]">
            {" "}
            to win ${parlay.potentialPayout.toFixed(2)}
          </span>
        </p>
        <span className="shrink-0 text-xs text-[var(--text-subtle)]">
          {formatDisplayDate(parlay.date)}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {parlay.legs.map((leg) => (
          <li
            key={`${leg.player}-${leg.stat}`}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <PlayerAvatar
              name={leg.player}
              espnAthleteId={leg.espnAthleteId}
              size={40}
            />
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
              {leg.player}
            </p>
            <span className="shrink-0 rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text)]">
              {formatMilestoneLabel(leg.stat, leg.threshold)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryCard({
  parlay,
  expanded,
  onToggle,
  onDelete,
  deleteDisabled,
  onBackfillRanked,
  backfillDisabled,
  onRevert,
  revertDisabled,
}: {
  parlay: SettledParlay;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  onBackfillRanked: () => Promise<void>;
  backfillDisabled?: boolean;
  onRevert?: () => void;
  revertDisabled?: boolean;
}) {
  const [showRankedResults, setShowRankedResults] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const win = parlay.result === "win";
  const rankedResults = parlay.rankedResults ?? [];
  const alternates = rankedResults.filter((r) => !r.inParlay);
  const rankedHits = rankedResults.filter((r) => r.hit).length;
  const hasRankedResults = rankedResults.length > 0;
  const hasPlaceTimePool = (parlay.rankedPool?.length ?? 0) > 0;

  useEffect(() => {
    if (!expanded) setShowRankedResults(false);
  }, [expanded]);

  async function handleOtherLegsClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (backfilling) return;
    if (hasRankedResults && hasPlaceTimePool) {
      setShowRankedResults((v) => !v);
      return;
    }
    setBackfilling(true);
    try {
      await onBackfillRanked();
      setShowRankedResults(true);
    } finally {
      setBackfilling(false);
    }
  }

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
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${win ? "bg-green-500/15 text-green-700" : "bg-red-500/15 text-red-600"}`}
            >
              {win ? "Win" : "Loss"}
            </span>
            <span className="text-xs text-[var(--text-subtle)]">
              {parlay.legs.filter((l) => l.hit).length}/{parlay.legs.length} legs
            </span>
          </span>
        </button>
        {onRevert && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRevert();
            }}
            disabled={revertDisabled}
            className="border-l border-[var(--border-strong)] px-3 text-xs text-[var(--text-faint)] hover:text-amber-300 disabled:opacity-40"
            aria-label="Revert last settle"
          >
            {revertDisabled ? "…" : "Revert"}
          </button>
        )}
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
        <div
          className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]"
          onTouchStart={(e) => e.stopPropagation()}
        >
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Parlay legs
          </p>
          {parlay.legs.map((leg) => (
            <p key={`${leg.player}-${leg.stat}-${leg.threshold}`}>
              {leg.hit ? "✅" : "❌"} {leg.player}{" "}
              {formatMilestoneLabel(leg.stat, leg.threshold)} → {leg.actualValue}
            </p>
          ))}
          {parlay.failureAnalysis && (
            <p className="mt-2 text-[var(--text-muted)]">{parlay.failureAnalysis}</p>
          )}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={handleOtherLegsClick}
              disabled={backfilling || backfillDisabled}
              className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:opacity-50"
            >
              {backfilling
                ? "Loading other legs…"
                : showRankedResults
                  ? "Hide other legs"
                  : hasRankedResults && hasPlaceTimePool
                    ? "Show other legs"
                    : hasRankedResults
                      ? "Refresh other legs"
                      : "Load other legs"}
            </button>
            {!hasRankedResults && !backfilling && (
              <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                Uses place-time ranked lines when saved; otherwise pre-game
                discovery (slate night excluded from last 5).
              </p>
            )}
            {hasRankedResults && showRankedResults && (
              <div className="mt-2 space-y-1">
                  <p className="text-[var(--text)]">
                    Ranked pool:{" "}
                    <span className="text-green-400">{rankedHits}</span>/
                    {rankedResults.length} hit
                    {alternates.length > 0 && (
                      <>
                        {" "}
                        · Alternates:{" "}
                        <span className="text-green-400">
                          {alternates.filter((r) => r.hit).length}
                        </span>
                        /{alternates.length}
                      </>
                    )}
                  </p>
                  {alternates.map((row) => (
                    <p
                      key={`${row.rank}-${row.player}-${row.stat}-${row.threshold}`}
                    >
                      {row.hit ? "✅" : "❌"}{" "}
                      <span className="text-[var(--text-faint)]">#{row.rank}</span>{" "}
                      {row.player}{" "}
                      {formatMilestoneLabel(row.stat, row.threshold)} →{" "}
                      {row.actualValue}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
