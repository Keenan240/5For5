/**
 * ESPN opponent + SAS/OKC H2H smoke test (run: npx tsx scripts/verify-espn-h2h.ts)
 */
import { getEspnGameLogs } from "../lib/espn";
import { gamesVsOpponent, splitVsOpponent } from "../lib/h2h";

async function main() {
  const logs = await getEspnGameLogs("Victor Wembanyama", 82);
  const { prior, series } = splitVsOpponent(logs, "SAS", "OKC");
  const vs = gamesVsOpponent(logs, "SAS", "OKC");
  console.log(
    "logs",
    logs.length,
    "prior vs OKC",
    prior.length,
    "series",
    series.length,
    "deduped vs OKC",
    vs.length
  );

  if (prior.length < 4) {
    throw new Error(`expected at least 4 reg-season SAS-OKC games, got ${prior.length}`);
  }
  if (vs.length === 0) {
    throw new Error("expected at least one SAS–OKC row for veto smoke test");
  }
  console.log("verify-espn-h2h: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
