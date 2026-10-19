import { requireSessionUser } from "@/lib/auth-user";
import { setState } from "@/lib/kv";

export async function POST() {
  const gate = await requireSessionUser();
  if (!gate.ok) return gate.response;

  await setState({ bankroll: 0, pending: [], history: [] }, gate.user.id);
  return Response.json({ ok: true, message: "Reset to $0 net" });
}
