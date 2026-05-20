export function getTodayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/** Slate date ±1 day (late West Coast games / UTC log dates). */
export function slateDateCandidates(slateYmd: string): string[] {
  return [addDaysYmd(slateYmd, -1), slateYmd, addDaysYmd(slateYmd, 1)];
}

/** YYYY-MM-DD → "May 17, 2025" (calendar date, no timezone shift). */
export function formatDisplayDate(ymd: string): string {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return ymd;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Canonical calendar date for every `GameLog.date` (Eastern YYYY-MM-DD).
 * NBA `GAME_DATE` is often `"APR 10, 2025"` — never use `slice(0, 10)` on raw
 * strings (that yields garbage like `"APR 10, 20"`) or ESPN + NBA rows for the
 * same night fail to dedupe, breaking “last 5” milestone windows.
 */
export function normalizeGameLogDate(raw: string): string {
  const trimmed = raw.trim();
  const ymd = logDateToYmd(trimmed);
  if (ymd) return ymd;
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return trimmed.slice(0, 10) || trimmed;
}

/** Normalize NBA / ESPN log dates to YYYY-MM-DD (Eastern). */
export function logDateToYmd(logDate: string): string | null {
  const iso = logDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const utcNoon = new Date(`${iso[1]}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(utcNoon);
  }

  const parsed = new Date(logDate);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(parsed);
}

export function gameLogMatchesSlateDate(
  logDate: string,
  slateYmd: string
): boolean {
  const ymd = logDateToYmd(logDate);
  if (!ymd) return false;
  return slateDateCandidates(slateYmd).includes(ymd);
}

export type PickBestSlateGameOptions = {
  /** Only match the parlay calendar date (not ±1 day). Use for live pending UI. */
  exactDateOnly?: boolean;
  /** When adjacent matching, include prior day (default false — avoids yesterday's box score). */
  allowPriorDay?: boolean;
};

export function pickBestSlateGame<T extends { date: string }>(
  logs: T[],
  slateYmd: string,
  options: PickBestSlateGameOptions = {}
): { game: T; matchedYmd: string } | null {
  let best: { game: T; matchedYmd: string; rank: number } | null = null;
  const adjacentAllowed = options.allowPriorDay
    ? slateDateCandidates(slateYmd)
    : [slateYmd, addDaysYmd(slateYmd, 1)];

  for (const game of logs) {
    const ymd = logDateToYmd(game.date);
    if (!ymd) continue;
    if (options.exactDateOnly) {
      if (ymd !== slateYmd) continue;
    } else if (!adjacentAllowed.includes(ymd)) {
      continue;
    }

    const rank =
      ymd === slateYmd ? 0 : ymd === addDaysYmd(slateYmd, 1) ? 1 : 2;
    if (!best || rank < best.rank) {
      best = { game, matchedYmd: ymd, rank };
    }
  }

  return best ? { game: best.game, matchedYmd: best.matchedYmd } : null;
}
