export function getTodayEastern(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
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

/** Normalize NBA / ESPN log dates to YYYY-MM-DD for comparison. */
export function logDateToYmd(logDate: string): string | null {
  const iso = logDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

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
  return ymd === slateYmd;
}
