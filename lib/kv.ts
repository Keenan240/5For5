import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";
import { normalizeParlayState } from "./pending";
import type { ParlayState } from "./types";

/** Shared pre-account key (also used when auth is not configured). */
const LEGACY_KEY = "parlay_state";
const LEGACY_CLAIMED_KEY = "parlay_state:legacy_claimed";
const DEFAULT_STATE: ParlayState = {
  bankroll: 0,
  pending: [],
  history: [],
};

function stateKey(userId?: string | null): string {
  if (!userId || userId === "local") return LEGACY_KEY;
  return `parlay:user:${userId}`;
}

const REDIS_RETRIES = 2;
const REDIS_RETRY_BASE_MS = 60;
/** Hard cap per Redis attempt — bad REDIS_URL must not stall boot. */
const REDIS_ATTEMPT_TIMEOUT_MS = 2_000;

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
    // We apply our own short timeouts + retries; disable SDK stacking.
    retry: { retries: 0 },
  });
  return redisClient;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      return await withTimeout(fn(), REDIS_ATTEMPT_TIMEOUT_MS, label);
    } catch (err) {
      lastErr = err;
      console.error(`Redis ${label} attempt ${attempt + 1} failed:`, err);
      if (attempt < REDIS_RETRIES - 1) {
        await new Promise((r) =>
          setTimeout(r, Math.min(REDIS_RETRY_BASE_MS * 2 ** attempt, 400))
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

/**
 * Load parlay state for a user.
 * - Signed-in Google users → `parlay:user:{id}`
 * - `local` / missing → legacy shared `parlay_state` (dev + pre-auth)
 */
export async function getState(userId?: string | null): Promise<ParlayState> {
  const redis = getRedis();
  const key = stateKey(userId);
  if (redis) {
    if (userId && userId !== "local") {
      await maybeClaimLegacyState(userId);
    }
    // Never invent empty state on Redis failure — that can wipe history on a later write.
    const state = await withRedisRetry("getState", () =>
      redis.get<ParlayState>(key)
    );
    return normalizeParlayState(state ?? { ...DEFAULT_STATE });
  }
  if (onVercel()) {
    throw new StorageNotConfiguredError();
  }
  return normalizeParlayState((await readLocal()) ?? { ...DEFAULT_STATE });
}

export async function setState(
  state: ParlayState,
  userId?: string | null
): Promise<void> {
  const redis = getRedis();
  const key = stateKey(userId);
  if (redis) {
    await withRedisRetry("setState", () => redis.set(key, state));
    return;
  }
  if (onVercel()) {
    throw new StorageNotConfiguredError();
  }
  await writeLocal(state);
}

/** First signed-in user inherits the old shared slip history once. */
async function maybeClaimLegacyState(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const userKey = stateKey(userId);
    const existing = await redis.get<ParlayState>(userKey);
    if (existing && (existing.history?.length || existing.pending?.length)) {
      return;
    }
    const claimed = await redis.get<string>(LEGACY_CLAIMED_KEY);
    if (claimed) return;
    const legacy = await redis.get<ParlayState>(LEGACY_KEY);
    if (!legacy) return;
    const hasData =
      (legacy.history?.length ?? 0) > 0 || (legacy.pending?.length ?? 0) > 0;
    if (!hasData) return;
    await redis.set(userKey, legacy);
    await redis.set(LEGACY_CLAIMED_KEY, userId);
  } catch (err) {
    console.error("legacy claim skipped:", err);
  }
}
