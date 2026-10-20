"use client";

import { formatDisplayDate, getTodayEastern } from "@/lib/dates";

type DateStripProps = {
  dates: string[];
  selected: string;
  onSelect: (ymd: string) => void;
  disabled?: boolean;
};

function shortLabel(ymd: string, today: string): string {
  if (ymd === today) return "Tonight";
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
  );
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function DateStrip({
  dates,
  selected,
  onSelect,
  disabled,
}: DateStripProps) {
  const today = getTodayEastern();

  return (
    <section className="mb-3">
      <div
        className="date-strip-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {dates.map((ymd) => {
          const active = ymd === selected;
          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(ymd)}
              title={formatDisplayDate(ymd)}
              style={{ touchAction: "pan-x pinch-zoom" }}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                active
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "bg-[var(--surface)] text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:text-[var(--text)]"
              }`}
            >
              {shortLabel(ymd, today)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
