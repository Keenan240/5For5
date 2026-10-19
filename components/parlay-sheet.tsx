"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  onRemovePick?: (key: string) => void;
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

/** Visible title/handle above the floating nav pill. */
const COLLAPSED_PEEK = 100;
const SNAP_VELOCITY = 0.45; // px/ms
const TAP_SLOP = 8; // px — treat as tap if movement under this

function navClearancePx(): number {
  if (typeof window === "undefined") return 76;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;height:var(--bottom-nav-clearance)";
  document.body.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h > 0 ? h : 76;
}

/** Sheet always reaches the screen bottom; collapsed peek sits above the nav. */
function collapsedHeight(): number {
  return COLLAPSED_PEEK + navClearancePx();
}

function expandedHeight(): number {
  if (typeof window === "undefined") return 480;
  return Math.round(window.innerHeight * 0.7);
}

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

function RemoveLegButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove leg"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors active:bg-[var(--surface-muted)] disabled:opacity-40"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden
      >
        <path
          d="M2 5h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function ParlaySheet({
  picks,
  maxLegs,
  oddsByLeg,
  onOddsChange,
  onRemovePick,
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
  const [maxH, setMaxH] = useState(expandedHeight);
  const [minH, setMinH] = useState(collapsedHeight);
  const [height, setHeight] = useState(() =>
    generating ? expandedHeight() : collapsedHeight()
  );
  const [dragging, setDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(height);
  heightRef.current = height;
  const minHRef = useRef(minH);
  minHRef.current = minH;
  const maxHRef = useRef(maxH);
  maxHRef.current = maxH;

  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    const sync = () => {
      setMaxH(expandedHeight());
      setMinH(collapsedHeight());
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (generating || loading) setExpanded(true);
  }, [generating, loading]);

  useEffect(() => {
    if (dragging) return;
    const next = expanded ? maxH : minH;
    setHeight(next);
    if (sheetRef.current) {
      sheetRef.current.style.height = `${next}px`;
    }
  }, [expanded, maxH, minH, dragging]);

  const snapTo = useCallback((open: boolean) => {
    setExpanded(open);
    const next = open ? expandedHeight() : collapsedHeight();
    setHeight(next);
    if (sheetRef.current) {
      sheetRef.current.style.height = `${next}px`;
    }
  }, []);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = performance.now();
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startH: heightRef.current,
      lastY: e.clientY,
      lastT: now,
      velocity: 0,
      moved: false,
    };
    setDragging(true);
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dy = d.startY - e.clientY; // up = taller
    if (Math.abs(e.clientY - d.startY) > TAP_SLOP) d.moved = true;
    const next = Math.min(
      maxHRef.current,
      Math.max(minHRef.current, d.startH + dy)
    );
    const dt = Math.max(1, now - d.lastT);
    d.velocity = (d.lastY - e.clientY) / dt; // up positive
    d.lastY = e.clientY;
    d.lastT = now;
    heightRef.current = next;
    // Direct DOM write so the sheet tracks the finger 1:1 without React lag.
    if (sheetRef.current) {
      sheetRef.current.style.height = `${next}px`;
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    const currentH = heightRef.current;
    setHeight(currentH);
    setDragging(false);

    if (!d.moved) {
      snapTo(!expanded);
      return;
    }

    const mid = (minHRef.current + maxHRef.current) / 2;
    if (d.velocity > SNAP_VELOCITY) {
      snapTo(true);
    } else if (d.velocity < -SNAP_VELOCITY) {
      snapTo(false);
    } else {
      snapTo(currentH >= mid);
    }
  };

  if (!show) return null;

  const ready = !generating && !loading && n === maxLegs && draftMath?.valid;
  const contentOpen = expanded || height > minH + 24 || dragging;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3">
      <div
        ref={sheetRef}
        className={`pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] ring-1 ring-[var(--border)] ${
          entered
            ? "translate-y-0 opacity-100"
            : "translate-y-[110%] opacity-0"
        } ${
          dragging
            ? ""
            : "transition-[height,transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        }`}
        style={{ height }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse slip" : "Expand slip"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              snapTo(!expanded);
            }
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex w-full shrink-0 touch-none cursor-grab flex-col items-center px-4 pt-3.5 active:cursor-grabbing"
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
        </div>

        {contentOpen && (
          <>
            <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
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
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-[var(--border-strong)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text)]">
                                {formatMilestoneLabel(
                                  pick.stat,
                                  pick.threshold
                                )}
                              </span>
                              {onRemovePick && (
                                <RemoveLegButton
                                  disabled={loading}
                                  onClick={() => onRemovePick(key)}
                                />
                              )}
                            </div>
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

            <div className="shrink-0 border-t border-[var(--border)] px-4 pt-2 pb-[calc(var(--bottom-nav-clearance)+0.5rem)]">
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
