import assert from "node:assert/strict";
import { getEspnGameLogs } from "../lib/espn";
import { getLast5Games, takeLast5Official } from "../lib/stats";

async function main() {
  const logs = await getEspnGameLogs("Tyrese Maxey", 20, "4431678");
  assert.ok(
    logs.every(
      (g) =>
        g.seasonType === "Regular Season" || g.seasonType === "Playoffs"
    ),
    "ESPN logs must not include Preseason"
  );

  const last5 = takeLast5Official(logs);
  assert.equal(last5.length, 5);
  const pts = last5.map((g) => g.pts);
  // 2026-27 RS (chronological among newest 5): 32, 26, 29, 27, 27
  assert.deepEqual(pts, [32, 26, 29, 27, 27]);
  assert.ok(
    last5.every((g) => g.date >= "2026-10-01"),
    "last-5 must be 2026-27 regular season only"
  );

  const viaApi = await getLast5Games(
    "Tyrese Maxey",
    undefined,
    undefined,
    undefined,
    undefined,
    "4431678"
  );
  assert.deepEqual(
    viaApi.map((g) => g.pts),
    [32, 26, 29, 27, 27]
  );
  assert.ok(
    viaApi.every((g) => g.seasonType !== undefined),
    "last-5 rows should carry seasonType"
  );
  assert.ok(
    viaApi.every((g) => g.date >= "2026-10-01"),
    "API last-5 must not include prior seasons"
  );

  console.log("verify-last5: Maxey last5 OK", {
    pts,
    games: viaApi.map((g) => `${g.date} ${g.opponent} ${g.pts}`),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
