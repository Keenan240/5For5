import { promises as fs } from "fs";
import path from "path";
import type { ParlayState } from "./types";

const KEY = "parlay_state";
const DEFAULT_STATE: ParlayState = {
  bankroll: 200,
  pending: null,
  history: [],
};

function localPath(): string {
  return path.join(process.cwd(), ".data", "parlay_state.json");
}

async function readLocal(): Promise<ParlayState | null> {
  try {
    const raw = await fs.readFile(localPath(), "utf-8");
    return JSON.parse(raw) as ParlayState;
  } catch {
    return null;
  }
}

async function writeLocal(state: ParlayState): Promise<void> {
  const dir = path.join(process.cwd(), ".data");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(localPath(), JSON.stringify(state, null, 2));
}

function hasVercelKvStorage(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getState(): Promise<ParlayState> {
  if (hasVercelKvStorage()) {
    const { kv } = await import("@vercel/kv");
    const state = await kv.get<ParlayState>(KEY);
    return state ?? { ...DEFAULT_STATE };
  }
  return (await readLocal()) ?? { ...DEFAULT_STATE };
}

export async function setState(state: ParlayState): Promise<void> {
  if (hasVercelKvStorage()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(KEY, state);
    return;
  }
  await writeLocal(state);
}
