"use client";

import type { ReactNode } from "react";
import { RESEARCH_MODE } from "@/lib/features";

export type AppTab = "home" | "results" | "community" | "suggest" | "streaks";

type BottomNavProps = {
  tab: AppTab;
  onChange: (tab: AppTab) => void;
};

export function BottomNav({ tab, onChange }: BottomNavProps) {
  if (RESEARCH_MODE) {
    return (
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))]"
        aria-label="Main"
      >
        <div className="pointer-events-auto flex w-[13.5rem] items-center gap-0.5 rounded-full bg-[var(--surface)] p-1 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] ring-1 ring-[var(--border)]">
          <NavButton
            active={tab === "home"}
            label="Home"
            onClick={() => onChange("home")}
            icon={<HomeIcon />}
          />
          <NavButton
            active={tab === "streaks"}
            label="Streaks"
            onClick={() => onChange("streaks")}
            icon={<StreakIcon />}
          />
          <NavButton
            active={tab === "suggest"}
            label="Suggest"
            onClick={() => onChange("suggest")}
            icon={<SuggestIcon />}
          />
        </div>
      </nav>
    );
  }

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))]"
      aria-label="Main"
    >
      <div className="pointer-events-auto flex w-[13.5rem] items-center gap-0.5 rounded-full bg-[var(--surface)] p-1 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] ring-1 ring-[var(--border)]">
        <NavButton
          active={tab === "home"}
          label="Home"
          onClick={() => onChange("home")}
          icon={<HomeIcon />}
        />
        <NavButton
          active={tab === "community"}
          label="Community"
          onClick={() => onChange("community")}
          icon={<CommunityIcon />}
        />
        <NavButton
          active={tab === "results"}
          label="Results"
          onClick={() => onChange("results")}
          icon={<ResultsIcon />}
        />
      </div>
    </nav>
  );
}

function NavButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 flex-1 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-black text-white"
          : "bg-transparent text-[var(--text-muted)]"
      }`}
    >
      {icon}
    </button>
  );
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </svg>
  );
}

function StreakIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 18V9" />
      <path d="M9 18V5" />
      <path d="M14 18v-6" />
      <path d="M19 18V7" />
    </svg>
  );
}

function SuggestIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="m15.5 8.5 1.5-1.5" />
      <path d="m7 17 1.5-1.5" />
      <path d="m15.5 15.5 1.5 1.5" />
      <path d="M7 7l1.5 1.5" />
    </svg>
  );
}

function ResultsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V11" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="8" r="3.25" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19" />
      <path d="M14 15.2c1.4-.6 3-.4 4.3.6.7.5 1.2 1.3 1.5 2.2" />
    </svg>
  );
}
