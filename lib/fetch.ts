const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetchWithTimeout(url, init, timeoutMs);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: text.slice(0, 120) };
    }
    try {
      return { ok: true, status: res.status, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, status: res.status, data: null, error: "Invalid JSON" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { ok: false, status: 0, data: null, error: message };
  }
}
