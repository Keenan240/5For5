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

/**
 * NBA season start year for a calendar date (ET YYYY-MM-DD).
 * Oct–Dec → that year; Jan–Sep → previous year.
 */
export function nbaSeasonYearForDate(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  if (!y || !m) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(new Date());
    const [ty, tm] = today.split("-").map(Number);
    return tm >= 10 ? ty : ty - 1;
  }
  return m >= 10 ? y : y - 1;
}

/** Current / configured season start year (2026 = 2026-27). */
export function nbaSeasonYear(): number {
  if (process.env.NBA_SEASON) {
    return parseInt(process.env.NBA_SEASON, 10);
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  return nbaSeasonYearForDate(today);
}

/** Season years to try against BallDontLie (date-derived ±1, plus env). */
export function bdlSeasonCandidates(ymd?: string): number[] {
  const primary = ymd ? nbaSeasonYearForDate(ymd) : nbaSeasonYear();
  const fromEnv = process.env.NBA_SEASON
    ? parseInt(process.env.NBA_SEASON, 10)
    : primary;
  return [...new Set([primary, fromEnv, primary + 1, primary - 1])];
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
