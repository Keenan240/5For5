const TTL_MS = 45_000;
/** Short TTL for live settle / pending leg polling */
export const SETTLE_POLL_CACHE_MS = 4_000;

type Entry<T> = { value: T; at: number };

const cache = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string, ttlMs = TTL_MS): T | null {
  if (ttlMs <= 0) return null;
  const hit = cache.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached<T>(key: string, value: T): void {
  cache.set(key, { value, at: Date.now() });
}

export async function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = TTL_MS
): Promise<T> {
  const hit = getCached<T>(key, ttlMs);
  if (hit !== null) return hit;
  const value = await fn();
  if (ttlMs > 0) setCached(key, value);
  return value;
}
