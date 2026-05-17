import { fetchJson } from "./fetch";

const BASE = "https://api.balldontlie.io/v1";

export function bdlHeaders(): HeadersInit {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) return {};
  return { Authorization: key };
}

export function hasBdlKey(): boolean {
  return Boolean(process.env.BALLDONTLIE_API_KEY);
}

export function nbaSeasonYear(): number {
  return parseInt(process.env.NBA_SEASON || "2025", 10);
}

type BdlMeta = { next_cursor?: number | null };

type BdlPage<T> = { data: T[]; meta?: BdlMeta };

/** Paginate with a hard page cap to avoid rate limits */
export async function fetchBdlPaginated<T>(
  path: string,
  maxPages = 3
): Promise<T[]> {
  const all: T[] = [];
  let cursor: number | null = null;
  const seen = new Set<number | null>();

  for (let page = 0; page < maxPages; page++) {
    const joiner = path.includes("?") ? "&" : "?";
    const url: string =
      cursor != null
        ? `${BASE}${path}${joiner}cursor=${cursor}`
        : `${BASE}${path}`;

    const result = await fetchJson<BdlPage<T>>(url, {
      headers: bdlHeaders(),
      cache: "no-store",
    });

    if (!result.ok || !result.data) break;

    all.push(...(result.data.data ?? []));

    const next = result.data.meta?.next_cursor ?? null;
    if (next == null || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  return all;
}
