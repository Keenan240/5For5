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
  // Newest-first StatMuse-style: 17, 17, 26, 13, 30
  assert.deepEqual(pts, [30, 13, 26, 17, 17]);

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
    [30, 13, 26, 17, 17]
  );
  assert.ok(
    viaApi.every((g) => g.seasonType !== undefined),
    "last-5 rows should carry seasonType"
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
