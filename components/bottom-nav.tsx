"use client";

import type { ReactNode } from "react";

export type AppTab = "home" | "results";

type BottomNavProps = {
  tab: AppTab;
  onChange: (tab: AppTab) => void;
};

export function BottomNav({ tab, onChange }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))]"
      aria-label="Main"
    >
      <div className="pointer-events-auto flex w-[9.5rem] items-center gap-0.5 rounded-full bg-[var(--surface)] p-1 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] ring-1 ring-[var(--border)]">
        <NavButton
          active={tab === "home"}
          label="Home"
          onClick={() => onChange("home")}
          icon={<HomeIcon />}
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
