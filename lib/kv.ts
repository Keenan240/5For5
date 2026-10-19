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

const REDIS_RETRIES = 3;
const REDIS_RETRY_BASE_MS = 80;

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

/**
 * Resolve Upstash REST credentials.
 * Newer Vercel Marketplace Redis often only injects REDIS_URL (TCP).
 * Older integrations set UPSTASH_* or KV_REST_*.
 */
function redisRestConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    process.env.REDIS_REST_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.REDIS_REST_TOKEN?.trim();
  if (url && token) return { url, token };

  // rediss://default:TOKEN@xxxx.upstash.io:6379 → https://xxxx.upstash.io + TOKEN
  const tcp =
    process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_URL?.trim();
  if (!tcp) return null;
  try {
    const parsed = new URL(tcp);
    const restToken = decodeURIComponent(parsed.password || "");
    const host = parsed.hostname;
    if (!restToken || !host) return null;
    return { url: `https://${host}`, token: restToken };
  } catch {
    return null;
  }
}

function redisConfigured(): boolean {
  return redisRestConfig() != null;
}

let redisClient: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const config = redisRestConfig();
  if (!config) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({
    ...config,
    retry: {
      retries: REDIS_RETRIES,
      backoff: (n) => Math.min(REDIS_RETRY_BASE_MS * 2 ** n, 800),
    },
  });
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
      "Database not connected. Connect Redis in Vercel → Storage to 5-for5 (needs REDIS_URL or UPSTASH_REDIS_REST_URL + TOKEN), then Redeploy."
    );
    this.name = "StorageNotConfiguredError";
  }
}

export class DatabaseUnreachableError extends Error {
  constructor(detail: string) {
    super(
      `Database unreachable (${detail}). Check Upstash Redis in Vercel → Storage, then Redeploy.`
    );
    this.name = "DatabaseUnreachableError";
  }
}

function redisErrorDetail(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "Redis request failed";
}

async function withRedisRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < REDIS_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.error(`Redis ${label} attempt ${attempt + 1} failed:`, err);
      if (attempt < REDIS_RETRIES - 1) {
        await new Promise((r) =>
          setTimeout(r, Math.min(REDIS_RETRY_BASE_MS * 2 ** attempt, 800))
        );
      }
    }
  }
  throw new DatabaseUnreachableError(redisErrorDetail(lastErr));
}

/** Ping Redis (or confirm local storage). Used by /api/status. */
export async function checkStorage(): Promise<{
  mode: "redis" | "local" | "none";
  ok: boolean;
  detail?: string;
}> {
  const mode = storageMode();
  if (mode === "none") {
    return {
      mode,
      ok: false,
      detail:
        "No Upstash Redis env vars. Add Storage → Upstash Redis and redeploy.",
    };
  }
  if (mode === "local") {
    return { mode, ok: true };
  }
  const redis = getRedis();
  if (!redis) {
    return { mode: "none", ok: false, detail: "Redis client unavailable." };
  }
  try {
    await withRedisRetry("ping", () => redis.ping());
    return { mode, ok: true };
  } catch (err) {
    return {
      mode,
      ok: false,
      detail: redisErrorDetail(err),
    };
  }
}

export async function getState(): Promise<ParlayState> {
  const redis = getRedis();
  if (redis) {
    // Never invent empty state on Redis failure — that can wipe history on a later write.
    const state = await withRedisRetry("getState", () =>
      redis.get<ParlayState>(KEY)
    );
    return normalizeParlayState(state ?? { ...DEFAULT_STATE });
  }
  if (onVercel()) {
    throw new StorageNotConfiguredError();
  }
  return normalizeParlayState((await readLocal()) ?? { ...DEFAULT_STATE });
}

export async function setState(state: ParlayState): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await withRedisRetry("setState", () => redis.set(KEY, state));
    return;
  }
  if (onVercel()) {
    throw new StorageNotConfiguredError();
  }
  await writeLocal(state);
}
