export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 text-[var(--text)]">
      <h1 className="text-xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-xs text-[var(--text-subtle)]">
        Last updated: October 19, 2026
      </p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--text-muted)]">
        <p>
          5For5 (“the app”) helps you track NBA milestone parlays. This policy
          explains what information we collect and how we use it.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          Information we collect
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-[var(--text)]">Account info</span>{" "}
            — when you sign in with Google, we receive your name, email address,
            and profile photo from Google.
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">App activity</span>{" "}
            — parlays you place, settle, or cancel, and related win/loss
            history used for your tracker and the community leaderboard.
          </li>
        </ul>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          How we use information
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>To create and maintain your account</li>
          <li>To save your parlays and results</li>
          <li>
            To show an optional community leaderboard (display name / handle and
            W–L record)
          </li>
          <li>To operate and improve the app</li>
        </ul>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          Storage & sharing
        </h2>
        <p>
          Data is stored using our hosting and database providers (for example
          Vercel and Upstash). We do not sell your personal information. We do
          not share it except as needed to run the service or if required by
          law.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">
          Your choices
        </h2>
        <p>
          You can sign out at any time. To request deletion of your account
          data, contact the developer using the support email listed on the
          Google sign-in screen.
        </p>

        <h2 className="text-sm font-semibold text-[var(--text)]">Contact</h2>
        <p>
          Questions about this policy can be sent to the developer contact
          email associated with the 5For5 Google Cloud project.
        </p>
      </div>
    </main>
  );
}
