"use client";

type BootLoaderProps = {
  progress: number;
  fadingOut: boolean;
};

export function BootLoader({ progress, fadingOut }: BootLoaderProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div
      aria-hidden={fadingOut}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg)] transition-opacity duration-500 ease-out ${
        fadingOut ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <p className="mb-6 text-lg font-semibold tracking-tight text-[var(--text)]">
        5For5
      </p>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="boot-loader-bar h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">Loading your slate…</p>
    </div>
  );
}
