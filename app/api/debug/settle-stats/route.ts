import { getState } from "@/lib/kv";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { checkAllLegsStatsReady } from "@/lib/stats";

export async function GET() {
  const state = await getState();

  if (!state.pending) {
    return Response.json({
      ok: false,
      message: "No pending parlay.",
      state: { bankroll: state.bankroll, pending: null },
    });
  }

  const pending = state.pending;
  const { ready, legs } = await checkAllLegsStatsReady(
    pending.legs,
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
      ready: l.ready,
      source: l.source,
      matchedDate: l.matchedDate,
      pts: l.pts,
      error: l.error,
    })),
    pendingLegs: pending.legs.map((leg) => ({
      player: leg.player,
      team: leg.team,
      stat: leg.stat,
      threshold: leg.threshold,
    })),
  });
}
