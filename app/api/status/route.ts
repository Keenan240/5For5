import { addDaysYmd } from "@/lib/dates";
import { reconcileBankroll } from "@/lib/history";
import { getState, setState, storageMode } from "@/lib/kv";
import { enrichPendingEspnIds } from "@/lib/pending";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getSlateForDate, getTodayEastern } from "@/lib/tonight";

const SETTLE_LOCK_BUDGET_MS = 4_000;
const ENRICH_BUDGET_MS = 2_000;

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

async function withBudget<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const fresh = url.searchParams.get("fresh") === "1";
  const focusDate = date ?? getTodayEastern();
  // Boot / silent refresh can skip empty nights; date-strip picks stay put.
  const allowAdvance = url.searchParams.get("advance") === "1";

  // Slate first — never block game load on pending enrich / settle polls.
  const slatePromise = resolveSlate(focusDate, fresh, allowAdvance);

  let state = await getState();
  const reconciled = reconcileBankroll(state);
  if (reconciled.bankroll !== state.bankroll) {
    await setState(reconciled);
    state = reconciled;
  }

  const [slate, enriched] = await Promise.all([
    slatePromise,
    withBudget(
      enrichPendingEspnIds(state),
      ENRICH_BUDGET_MS,
      { state, changed: false as const }
    ),
  ]);

  if (enriched.changed) {
    await setState(enriched.state);
    state = enriched.state;
  }

  let settleLocks: Record<string, ReturnType<typeof serializeLock>> = {};
  if (state.pending.length > 0) {
    const locks = await withBudget(
      Promise.all(
        state.pending.map(
          async (p) =>
            [p.date, serializeLock(await getSettleLockStatus(p))] as const
        )
      ),
      SETTLE_LOCK_BUDGET_MS,
      null
    );
    if (locks) settleLocks = Object.fromEntries(locks);
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
