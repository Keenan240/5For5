const TTL_MS = 45_000;

type Entry<T> = { value: T; at: number };

const cache = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | null {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
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
  fn: () => Promise<T>
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  setCached(key, value);
  return value;
}
