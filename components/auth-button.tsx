"use client";

import { signIn, signOut, useSession } from "next-auth/react";

type AuthButtonProps = {
  authEnabled?: boolean;
};

export function AuthButton({ authEnabled = true }: AuthButtonProps) {
  const { data: session, status } = useSession();

  if (!authEnabled) return null;

  if (status === "loading") {
    return (
      <span className="text-xs text-[var(--text-subtle)]">…</span>
    );
  }

  if (session?.user) {
    return (
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="flex max-w-[9rem] items-center gap-2 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-left"
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[10px] font-semibold">
            {(session.user.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 truncate text-xs font-medium text-[var(--text)]">
          Sign out
        </span>
      </button>
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
