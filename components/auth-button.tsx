"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type AuthButtonProps = {
  authEnabled?: boolean;
};

export function AuthButton({ authEnabled = true }: AuthButtonProps) {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!authEnabled) return null;

  if (status === "loading") {
    return (
      <span className="text-xs text-[var(--text-subtle)]">…</span>
    );
  }

  if (session?.user) {
    const initial = (session.user.name ?? "?").slice(0, 1).toUpperCase();
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-white"
        >
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-xs font-semibold text-[var(--text)]">
              {initial}
            </span>
          )}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="opts-menu-panel absolute right-0 top-[calc(100%+0.4rem)] z-[60] min-w-[8.5rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg ring-1 ring-black/5"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              className="flex w-full px-3.5 py-2.5 text-left text-sm font-medium text-[var(--text)] active:bg-[var(--surface-muted)]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void signIn("google", { callbackUrl: "/" })}
      className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
    >
      Sign in
    </button>
  );
}
