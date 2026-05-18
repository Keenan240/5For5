/**
 * ESPN opponent + SAS/OKC H2H smoke test (run: npx tsx scripts/verify-espn-h2h.ts)
 */
import { getEspnGameLogs } from "../lib/espn";
import { buildH2hEvaluation, splitVsOpponent } from "../lib/h2h";

async function main() {
  const logs = await getEspnGameLogs("Victor Wembanyama", 82);
  const { prior, series } = splitVsOpponent(logs, "SAS", "OKC");
  console.log("logs", logs.length, "prior vs OKC", prior.length, "series", series.length);

  const eval_ = buildH2hEvaluation(logs, "SAS", "OKC");
  if (!eval_) throw new Error("expected H2H eval");
  console.log("tier", eval_.tier, "h2hSample", eval_.h2hSample.length);

  if (prior.length < 4) {
    throw new Error(`expected at least 4 reg-season SAS-OKC games, got ${prior.length}`);
  }
  if (eval_.h2hSample.length === 0) {
    throw new Error("expected non-empty h2hSample in early tier");
  }
  console.log("verify-espn-h2h: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
