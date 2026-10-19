import { requireSessionUser } from "@/lib/auth-user";
import { reopenCommunityFeedItem } from "@/lib/community-feed";
import { revertLastSettle } from "@/lib/revert-settle";
import { getSettleLockStatus } from "@/lib/settle-lock";
import { getUser } from "@/lib/users";

export async function POST() {
  try {
    const gate = await requireSessionUser();
    if (!gate.ok) return gate.response;

    const result = await revertLastSettle(gate.user.id);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, state: result.state },
        { status: 400 }
      );
    }

    if (gate.user.id !== "local") {
      const profile = await getUser(gate.user.id);
      const pending = result.state.pending[result.state.pending.length - 1];
      if (profile && pending) {
        void reopenCommunityFeedItem(profile, pending).catch((err) =>
          console.error("community feed reopen failed:", err)
        );
      }
    }

    const focus = result.state.pending[0] ?? null;
    const settleLock = focus ? await getSettleLockStatus(focus) : null;

    return Response.json({
      ok: true,
      message: result.message,
      state: result.state,
      settleLock: settleLock
        ? {
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
          }
        : null,
    });
  } catch (err) {
    console.error("Revert settle error:", err);
    return Response.json(
      { ok: false, error: "Failed to revert settle." },
      { status: 500 }
    );
  }
}
