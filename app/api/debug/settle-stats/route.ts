import { getState } from "@/lib/kv";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { checkAllLegsStatsReady } from "@/lib/stats";
import { getTodayEastern } from "@/lib/tonight";

export async function GET(request: Request) {
  const state = await getState();
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  const pending =
    (date && state.pending.find((p) => p.date === date)) ||
    state.pending.find((p) => p.date === getTodayEastern()) ||
    state.pending[0] ||
    null;

  if (!pending) {
    return Response.json({
      ok: false,
      message: "No pending parlay.",
      state: { bankroll: state.bankroll, pending: state.pending },
    });
  }

  const legsForCheck = pending.legs.map((leg) => ({
    player: leg.player,
    stat: leg.stat,
    threshold: leg.threshold,
  }));
  const { ready, legs } = await checkAllLegsStatsReady(
    legsForCheck,
    pending.date
  );
  const lock = await getSettleLockStatus(pending);

  return Response.json({
    ok: true,
    slateDate: pending.date,
    statsReady: ready,
    lockReason: lock.lockReason,
    locked: lock.locked,
    legs: legs.map((l) => ({
      player: l.player,
      stat: l.stat,
      threshold: l.threshold,
      ready: l.ready,
      source: l.source,
      matchedDate: l.matchedDate,
      actualValue: l.actualValue,
      hit: l.hit,
      error: l.error,
    })),
    pendingLegs: pending.legs.map((leg) => ({
      player: leg.player,
      team: leg.team,
      stat: leg.stat,
      threshold: leg.threshold,
      espnAthleteId: leg.espnAthleteId,
    })),
  });
}
