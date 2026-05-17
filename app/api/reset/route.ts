import { setState } from "@/lib/kv";

export async function POST() {
  await setState({ bankroll: 200, pending: null, history: [] });
  return Response.json({ ok: true, message: "Reset to $200" });
}
