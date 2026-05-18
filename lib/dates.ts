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

export function pickBestSlateGame<T extends { date: string }>(
  logs: T[],
  slateYmd: string
): { game: T; matchedYmd: string } | null {
  let best: { game: T; matchedYmd: string; rank: number } | null = null;

  for (const game of logs) {
    const ymd = logDateToYmd(game.date);
    if (!ymd || !slateDateCandidates(slateYmd).includes(ymd)) continue;

    const rank = ymd === slateYmd ? 0 : 1;
    if (!best || rank < best.rank) {
      best = { game, matchedYmd: ymd, rank };
    }
  }

  return best ? { game: best.game, matchedYmd: best.matchedYmd } : null;
}
