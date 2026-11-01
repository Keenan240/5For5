/**
 * Guard: LeBron last-5 must be 2026-27 RS, never 2025-26 playoff lines.
 * Run: npx tsx scripts/check-lebron-season.ts
 */
import assert from "node:assert/strict";
import { nbaSeasonYear } from "../lib/bdl-client";
import { espnCurrentSeasonEndYear, getEspnGameLogs } from "../lib/espn";
import { getLast5Games, takeLast5Official } from "../lib/stats";

async function main() {
  // Stale env must not pin us to last season.
  process.env.NBA_SEASON = "2025";
  assert.equal(nbaSeasonYear(), 2026, "stale NBA_SEASON=2025 must yield 2026 in Oct 2026");
  assert.equal(espnCurrentSeasonEndYear(), 2027);

  const logs = await getEspnGameLogs("LeBron James", 25, "1966");
  const last5 = takeLast5Official(logs);
  const pts = last5.map((g) => g.pts);
  console.log("LeBron last5", last5.map((g) => `${g.date} ${g.pts}`));

  assert.equal(last5.length, 5);
  assert.ok(last5.every((g) => g.date >= "2026-10-01"));
  assert.deepEqual(pts, [14, 17, 18, 13, 20]);

  // These are the bad 2025-26 playoff/RS lines users were seeing.
  assert.ok(!pts.includes(24) || pts.join(",") === "14,17,18,13,20");
  assert.notDeepEqual(pts, [28, 27, 23, 19, 24]);
  assert.notDeepEqual(pts, [24, 19, 23, 27, 28]);

  const viaApi = await getLast5Games(
    "LeBron James",
    undefined,
    undefined,
    undefined,
    { beforeSlateYmd: "2026-10-31" },
    "1966"
  );
  assert.deepEqual(
    viaApi.map((g) => g.pts),
    [14, 17, 18, 13, 20]
  );

  console.log("check-lebron-season: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
