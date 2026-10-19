"use client";

import type { ReactNode } from "react";
import type { StatCategory } from "@/lib/types";
import { PlayerAvatar } from "@/components/player-avatar";
import { FiveForFive } from "@/components/five-for-five";

type PlayerLegCardProps = {
  player: string;
  matchup: string;
  espnAthleteId?: string | null;
  last5: number[];
  /** Colors last-5 relative to this line when set with `stat`. */
  threshold?: number;
  stat?: StatCategory;
  /** Right-side pill (milestone or Add/Selected). */
  action: ReactNode;
  /** Optional row under last-5 (e.g. FanDuel odds). */
  footer?: ReactNode;
};

export function PlayerLegCard({
  player,
  matchup,
  espnAthleteId,
  last5,
  threshold,
  stat,
  action,
  footer,
}: PlayerLegCardProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <PlayerAvatar name={player} espnAthleteId={espnAthleteId} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
              {player}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
              {matchup}
            </p>
          </div>
          <div className="shrink-0 pt-0.5">{action}</div>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            Last 5
          </span>
          <FiveForFive
            values={last5}
            threshold={threshold}
            stat={stat}
            className="mt-0 py-0"
          />
        </div>
        {footer}
      </div>
    </div>
  );
}
