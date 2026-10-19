import { addDaysYmd, getTodayEastern } from "./dates";
import type { SettledParlay } from "./types";

export type WeekDayResult = {
  ymd: string;
  /** Short weekday label (Mon, Tue, …) */
  label: string;
  result: "win" | "loss" | null;
};

/** Sunday-start week containing `anchorYmd` (Eastern calendar). */
export function weekStartSunday(anchorYmd: string): string {
  const [y, m, d] = anchorYmd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = utc.getUTCDay(); // 0 = Sunday
  return addDaysYmd(anchorYmd, -dow);
}

export function buildWeekRecord(
  history: SettledParlay[],
  anchorYmd: string = getTodayEastern()
): WeekDayResult[] {
  const start = weekStartSunday(anchorYmd);
  const byDate = new Map<string, "win" | "loss">();
  for (const entry of history) {
    // Latest result for a date wins if multiple exist
    byDate.set(entry.date, entry.result);
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels.map((label, i) => {
    const ymd = addDaysYmd(start, i);
    return {
      ymd,
      label,
      result: byDate.get(ymd) ?? null,
    };
  });
}

export function upcomingSlateDates(
  fromYmd: string = getTodayEastern(),
  count = 8
): string[] {
  return Array.from({ length: count }, (_, i) => addDaysYmd(fromYmd, i));
}
