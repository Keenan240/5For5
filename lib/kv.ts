import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";
import { normalizeParlayState } from "./pending";
import type { ParlayState } from "./types";

const KEY = "parlay_state";
const DEFAULT_STATE: ParlayState = {
  bankroll: 0,
  pending: [],
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

function redisRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  if (url && token) return { url, token };
  return null;
}

let redisClient: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const config = redisRestConfig();
  if (!config) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis(config);
  return redisClient;
}

function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

export function storageMode(): "redis" | "local" | "none" {
  if (getRedis()) return "redis";
  if (onVercel()) return "none";
  return "local";
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Database not connected. In Vercel → Storage, add Upstash Redis and redeploy (needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)."
    );
    this.name = "StorageNotConfiguredError";
  }
}

export async function getState(): Promise<ParlayState> {
  const redis = getRedis();
  if (redis) {
    try {
      const state = await redis.get<ParlayState>(KEY);
      return normalizeParlayState(state ?? { ...DEFAULT_STATE });
    } catch (err) {
      // Upstash throws plain "fetch failed" when REST is unreachable.
      console.error("Redis getState failed:", err);
      return { ...DEFAULT_STATE };
    }
  }
  if (onVercel()) {
    return { ...DEFAULT_STATE };
  }
  return normalizeParlayState((await readLocal()) ?? { ...DEFAULT_STATE });
}

export async function setState(state: ParlayState): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(KEY, state);
      return;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Redis write failed";
      console.error("Redis setState failed:", err);
      throw new Error(
        `Database unreachable (${detail}). Check Upstash Redis in Vercel → Storage.`
      );
    }
  }
  if (onVercel()) {
    throw new StorageNotConfiguredError();
  }
  await writeLocal(state);
}
