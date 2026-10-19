"use client";

import { useState } from "react";
import { espnHeadshotUrl } from "@/lib/player-image";

type PlayerAvatarProps = {
  name: string;
  espnAthleteId?: string | null;
  size?: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function PlayerAvatar({
  name,
  espnAthleteId,
  size = 36,
}: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const src =
    espnAthleteId && !failed
      ? espnHeadshotUrl(espnAthleteId, Math.max(size * 2, 96))
      : null;

  if (src) {
    return (
      // ESPN CDN; next/image not required for external headshots in this layout
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover object-top bg-[var(--surface-muted)]"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
