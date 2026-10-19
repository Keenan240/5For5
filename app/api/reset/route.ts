import { setState } from "@/lib/kv";

export async function POST() {
  await setState({ bankroll: 0, pending: [], history: [] });
  return Response.json({ ok: true, message: "Reset to $0 net" });
}
