import { addDaysYmd } from "@/lib/dates";
import { reconcileBankroll } from "@/lib/history";
import { getState, setState, storageMode } from "@/lib/kv";
import { enrichPendingEspnIds } from "@/lib/pending";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getSlateForDate, getTodayEastern } from "@/lib/tonight";
import type { ParlayState } from "@/lib/types";

const SETTLE_LOCK_BUDGET_MS = 3_000;
const ENRICH_BUDGET_MS = 1_500;
const GET_STATE_BUDGET_MS = 2_500;
const SLATE_BUDGET_MS = 8_000;

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

  // Parallel lookup — sequential ESPN calls were stalling boot on empty nights.
  const candidates = await Promise.all(
    [1, 2, 3, 4].map((i) =>
      getSlateForDate(addDaysYmd(requested, i), { gamesOnly: true })
    )
  );
  return candidates.find((c) => c.games.length > 0) ?? slate;
}

function emptyPayload(
  focusDate: string,
  state: ParlayState,
  error?: string,
  storage?: { ok: boolean; detail?: string }
) {
  const mode = storageMode();
  const ok = storage?.ok ?? mode === "local";
  return {
    ...state,
    storage: mode,
    storageOk: ok,
    storageDetail: ok ? undefined : storage?.detail,
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
  let storageOk = storageMode() !== "none";
  let storageDetail: string | undefined;

  try {
    const loaded = await withBudget(
      getState().then(async (s) => {
        const reconciled = reconcileBankroll(s);
        if (reconciled.bankroll !== s.bankroll) {
          await safeSetState(reconciled);
          return reconciled;
        }
        return s;
      }),
      GET_STATE_BUDGET_MS,
      null
    );
    if (loaded) {
      state = loaded;
    } else {
      storageOk = false;
      storageDetail =
        "Database slow/unreachable. Check Upstash Redis in Vercel → Storage.";
    }
  } catch (err) {
    console.error("status getState failed:", err);
    storageOk = false;
    storageDetail =
      err instanceof Error
        ? err.message
        : "Database unreachable. Check Upstash Redis in Vercel → Storage.";
  }

  let slate;
  try {
    const resolved = await withBudget(
      resolveSlate(focusDate, fresh, allowAdvance),
      SLATE_BUDGET_MS,
      null
    );
    if (!resolved) {
      return Response.json(
        emptyPayload(focusDate, state, "slate_timeout", {
          ok: storageOk,
          detail: storageDetail,
        })
      );
    }
    slate = resolved;
  } catch (err) {
    console.error("status slate failed:", err);
    return Response.json(
      emptyPayload(
        focusDate,
        state,
        err instanceof Error ? err.message : "slate_failed",
        { ok: storageOk, detail: storageDetail }
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
    storageOk,
    storageDetail: storageOk ? undefined : storageDetail,
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
