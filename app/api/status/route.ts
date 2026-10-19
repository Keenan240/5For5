import { reconcileBankroll } from "@/lib/history";
import { getState, setState, storageMode } from "@/lib/kv";
import { enrichPendingEspnIds } from "@/lib/pending";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getSlateForDate, getTodayEastern } from "@/lib/tonight";

const SETTLE_LOCK_BUDGET_MS = 8_000;

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

export async function GET(request: Request) {
  let state = await getState();
  const reconciled = reconcileBankroll(state);
  if (reconciled.bankroll !== state.bankroll) {
    await setState(reconciled);
    state = reconciled;
  }

  const enriched = await enrichPendingEspnIds(state);
  if (enriched.changed) {
    await setState(enriched.state);
    state = enriched.state;
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const fresh = url.searchParams.get("fresh") === "1";

  const slate = await getSlateForDate(date ?? getTodayEastern(), { fresh });

  const focusDate = date ?? getTodayEastern();
  let settleLocks: Record<string, ReturnType<typeof serializeLock>> = {};

  if (state.pending.length > 0) {
    const locks = await Promise.race([
      Promise.all(
        state.pending.map(
          async (p) =>
            [p.date, serializeLock(await getSettleLockStatus(p))] as const
        )
      ),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SETTLE_LOCK_BUDGET_MS)
      ),
    ]);
    if (locks) {
      settleLocks = Object.fromEntries(locks);
    }
  }

  const focusPending =
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
