import type { StatCategory } from "@/lib/types";
import { last5ValueTone } from "@/lib/milestones";

type FiveForFiveProps = {
  values: number[];
  className?: string;
  /** When set with threshold, color each game by cushion over the line. */
  threshold?: number;
  stat?: StatCategory;
};

const TONE_CLASS: Record<"danger" | "warn" | "safe" | "muted", string> = {
  danger: "text-red-500",
  warn: "text-amber-500",
  safe: "text-emerald-600",
  muted: "text-[var(--text-subtle)]",
};

export function FiveForFive({
  values,
  className = "",
  threshold,
  stat,
}: FiveForFiveProps) {
  const colorize = threshold != null && stat != null;

  return (
    <p
      className={`font-mono text-[11px] leading-snug tracking-wide ${className}`}
    >
      {values.map((v, i) => {
        const tone = colorize
          ? last5ValueTone(v, threshold, stat)
          : "muted";
        return (
          <span key={`${i}-${v}`}>
            {i > 0 && (
              <span className="text-[var(--text-faint)]"> · </span>
            )}
            <span className={TONE_CLASS[tone]}>{v}</span>
          </span>
        );
      })}
    </p>
  );
}
