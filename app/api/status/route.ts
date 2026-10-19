import { addDaysYmd } from "@/lib/dates";
import { reconcileBankroll } from "@/lib/history";
import { getState, setState, storageMode } from "@/lib/kv";
import { enrichPendingEspnIds } from "@/lib/pending";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getSlateForDate, getTodayEastern } from "@/lib/tonight";
import type { ParlayState } from "@/lib/types";

const SETTLE_LOCK_BUDGET_MS = 3_000;
const ENRICH_BUDGET_MS = 1_500;

function serializeLock(
  settleLock: Awaited<ReturnType<typeof getSettleLockStatus>>
) {
  return {
    locked: settleLock.locked,
    lockReason: settleLock.lockReason,
    unlockAt: settleLock.unlockAt?.toISOString() ?? null,
    unlockLabel: settleLock.unlockLabel,
    remainingMs: settleLock.remainingMs,
    statsReady: settleLock.statsReady,
    allGamesFinal: settleLock.allGamesFinal,
    usingFallbackUnlock: settleLock.usingFallbackUnlock,
    isTodaysSlate: settleLock.isTodaysSlate,
    deferredAfterRevert: settleLock.deferredAfterRevert,
    legsStats: settleLock.legsStats,
  };
}

/** Race a promise against a timeout; never reject (status must stay 200). */
async function withBudget<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise.then(
      (v) => v,
      () => fallback
    ),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function safeSetState(state: ParlayState): Promise<boolean> {
  try {
    await setState(state);
    return true;
  } catch (err) {
    console.error("status setState skipped:", err);
    return false;
  }
}

/** Prefer a nearby night that actually has games when the requested date is empty. */
async function resolveSlate(
  requested: string,
  fresh: boolean,
  allowAdvance: boolean
) {
  const slate = await getSlateForDate(requested, {
    fresh,
    gamesOnly: true,
  });
  if (slate.games.length > 0 || !allowAdvance) return slate;

  for (let i = 1; i <= 4; i++) {
    const next = addDaysYmd(requested, i);
    const candidate = await getSlateForDate(next, { gamesOnly: true });
    if (candidate.games.length > 0) return candidate;
  }
  return slate;
}

function emptyPayload(
  focusDate: string,
  state: ParlayState,
  error?: string
) {
  return {
    ...state,
    storage: storageMode(),
    qualifiedCount: null,
    sliderMax: 8,
    slate: {
      date: focusDate,
      games: [],
      rosterCount: 0,
      source: "espn" as const,
      rosterSource: "none" as const,
    },
    settleLock: null,
    settleLocks: {},
    error: error ?? undefined,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const fresh = url.searchParams.get("fresh") === "1";
  const focusDate = date ?? getTodayEastern();
  const allowAdvance = url.searchParams.get("advance") === "1";

  let state: ParlayState = {
    bankroll: 0,
    pending: [],
    history: [],
  };

  try {
    state = await getState();
    const reconciled = reconcileBankroll(state);
    if (reconciled.bankroll !== state.bankroll) {
      await safeSetState(reconciled);
      state = reconciled;
    }
  } catch (err) {
    console.error("status getState failed:", err);
  }

  let slate;
  try {
    slate = await resolveSlate(focusDate, fresh, allowAdvance);
  } catch (err) {
    console.error("status slate failed:", err);
    return Response.json(
      emptyPayload(
        focusDate,
        state,
        err instanceof Error ? err.message : "slate_failed"
      )
    );
  }

  try {
    const enriched = await withBudget(
      enrichPendingEspnIds(state),
      ENRICH_BUDGET_MS,
      { state, changed: false as const }
    );
    if (enriched.changed) {
      await safeSetState(enriched.state);
      state = enriched.state;
    }
  } catch (err) {
    console.error("status enrich skipped:", err);
  }

  let settleLocks: Record<string, ReturnType<typeof serializeLock>> = {};
  if (state.pending.length > 0) {
    try {
      const locks = await withBudget(
        Promise.all(
          state.pending.map(async (p) => {
            try {
              return [
                p.date,
                serializeLock(await getSettleLockStatus(p)),
              ] as const;
            } catch {
              return null;
            }
          })
        ).then(
          (rows) =>
            Object.fromEntries(
              rows.filter((r): r is NonNullable<typeof r> => r != null)
            ),
          () => ({})
        ),
        SETTLE_LOCK_BUDGET_MS,
        {}
      );
      settleLocks = locks;
    } catch (err) {
      console.error("status settleLocks skipped:", err);
    }
  }

  const focusPending =
    state.pending.find((p) => p.date === slate.date) ??
    state.pending.find((p) => p.date === focusDate) ??
    state.pending[0] ??
    null;
  const settleLock = focusPending
    ? settleLocks[focusPending.date] ?? null
    : null;

  return Response.json({
    ...state,
    storage: storageMode(),
    qualifiedCount: null,
    sliderMax: 8,
    slate: {
      date: slate.date,
      games: slate.games,
      rosterCount: slate.players.length,
      source: slate.source,
      rosterSource: slate.rosterSource,
    },
    settleLock,
    settleLocks,
  });
}
