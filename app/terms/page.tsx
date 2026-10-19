export default function TermsPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 text-[var(--text)]">
      <h1 className="text-xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Last updated: October 19, 2026
      </p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--text-muted)]">
        <p>
          By using 5For5, you agree to these terms. If you do not agree, do not
          use the app.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          What 5For5 is
        </h2>
        <p>
          5For5 is a personal / community tracker for NBA milestone-style
          parlays. It is for informational and entertainment use. It is{" "}
          <span className="font-medium text-[var(--text)]">
            not a sportsbook
          </span>
          , does not place real-money bets for you, and does not guarantee
          outcomes.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">Accounts</h2>
        <p>
          You may sign in with Google to save your own slips and appear on the
          community leaderboard. You are responsible for activity under your
          account.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          Acceptable use
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Do not abuse, attack, or attempt to disrupt the service</li>
          <li>Do not attempt to access another user’s private data</li>
          <li>Do not use the app for unlawful purposes</li>
        </ul>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          No warranties
        </h2>
        <p>
          The app is provided “as is.” Stats, odds helpers, and discovery
          suggestions can be wrong or incomplete. You are responsible for any
          decisions you make using the app.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          Limitation of liability
        </h2>
        <p>
          To the fullest extent allowed by law, the developer is not liable for
          losses related to use of the app, including betting losses or data
          loss.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">Changes</h2>
        <p>
          These terms may be updated from time to time. Continued use of the
          app after changes means you accept the updated terms.
        </p>
      </div>
    </main>
  );
}
