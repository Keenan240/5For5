"use client";

import { useState } from "react";
import { canonicalTeamAbbrev } from "@/lib/h2h";
import { teamLogoUrl } from "@/lib/team-logo";

type TeamLogoProps = {
  abbrev: string;
  size?: number;
};

export function TeamLogo({ abbrev, size = 28 }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const label = canonicalTeamAbbrev(abbrev);

  if (failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[9px] font-bold text-[var(--text-muted)]"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {label.slice(0, 3)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoUrl(label, Math.max(size * 2, 72))}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
