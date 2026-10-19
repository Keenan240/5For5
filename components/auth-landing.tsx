"use client";

import { signIn } from "next-auth/react";

export function AuthLanding() {
  return (
    <main className="auth-landing fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden overscroll-none px-6 pb-16 pt-10">
      <div className="auth-landing-glow pointer-events-none absolute inset-0" aria-hidden />

      <div className="auth-landing-enter relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <p className="text-[2.75rem] font-semibold tracking-tight text-[var(--text)]">
          5For5
        </p>
        <p className="mt-3 max-w-[18rem] text-sm leading-relaxed text-[var(--text-muted)]">
          Track milestone parlays. Build a 5-leg slip. Climb the community board.
        </p>

        <button
          type="button"
          onClick={() => void signIn("google", { callbackUrl: "/" })}
          className="auth-landing-cta mt-10 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-black text-sm font-semibold text-white"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-subtle)]">
          Signing in creates your account and saves your slips.
        </p>

        <p className="mt-8 text-[10px] text-[var(--text-faint)]">
          <a href="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </a>
          <span className="mx-2">·</span>
          <a href="/terms" className="underline-offset-2 hover:underline">
            Terms
          </a>
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7 12.9 19.6C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.1 39.5 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l.0.0 6.2 5.2C39.1 36.9 44 32 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
