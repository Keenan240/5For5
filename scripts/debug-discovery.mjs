/**
 * Run: node --env-file=.env.local scripts/debug-discovery.mjs
 */
import { getTonightSlate } from "../lib/tonight.ts";
import { loadPlayerIdMap, getLast5PlayoffGames } from "../lib/stats.ts";
import {
  STAT_CATEGORIES,
  LADDERS,
  discoverMilestone,
  extractStatValues,
} from "../lib/milestones.ts";
import { passesOddsCap, estimateOddsFromBuffer } from "../lib/odds.ts";

const slate = await getTonightSlate();
console.log("\n=== SLATE ===");
console.log("Date:", slate.date);
console.log("Games:", slate.games.map((g) => `${g.away}@${g.home}`).join(", "));
console.log("Roster count:", slate.players.length);
console.log("Source:", slate.source);
console.log("Sample roster:", slate.players.slice(0, 8).map((p) => p.player).join(", "));

const idMap = await loadPlayerIdMap();
const roster = slate.players.slice(0, 36);

let noId = 0;
let noLogs = 0;
let allMilestones = [];
let afterOdds = [];

for (const p of roster) {
  const pid = idMap.get(p.player.toLowerCase()) ?? "missing";
  const logs = await getLast5PlayoffGames(p.player, idMap);
  if (![...idMap.values()].length) break;
  if (logs.length === 0) {
    const parts = p.player.toLowerCase().split(" ");
    let found = false;
    for (const [name] of idMap) {
      if (parts.every((x) => name.includes(x))) found = true;
    }
    if (!found) noId++;
  }
  if (logs.length < 5) {
    if (logs.length > 0) console.log(`  <5 games: ${p.player} (${logs.length}) last:`, logs.map((l) => l.pts).join(","));
    noLogs++;
    continue;
  }

  for (const stat of STAT_CATEGORIES) {
    const values = extractStatValues(logs, stat);
    const threshold = discoverMilestone(values, LADDERS[stat]);
    if (threshold === null) continue;
    const buffer = values.reduce((s, v) => s + (v - threshold), 0) / 5;
    const odds = estimateOddsFromBuffer(buffer, stat);
    const leg = { player: p.player, team: p.team, stat, threshold, last5: values, odds };
    allMilestones.push(leg);
    if (passesOddsCap(odds)) afterOdds.push(leg);
  }
}

console.log("\n=== FUNNEL ===");
console.log("Roster evaluated:", roster.length);
console.log("No NBA id match:", noId);
console.log("Fewer than 5 playoff games:", noLogs);
console.log("Total milestone legs (all stats, all players):", allMilestones.length);
console.log("After odds cap (>-1200):", afterOdds.length);

const byPlayer = new Map();
for (const l of afterOdds) {
  const ex = byPlayer.get(l.player);
  if (!ex) byPlayer.set(l.player, l);
}
console.log("After 1-leg-per-player rule:", byPlayer.size);

console.log("\n=== ALL QUALIFYING MILESTONES ===");
for (const l of allMilestones.sort((a, b) => a.player.localeCompare(b.player))) {
  const ok = passesOddsCap(l.odds);
  console.log(
    `${ok ? "✓" : "✗"} ${l.player} ${l.threshold}+ ${l.stat.split("-")[0]} | last5: ${l.last5.join(",")} | est odds ${l.odds}`
  );
}

console.log("\n=== FINAL POOL (1 per player) ===");
for (const l of byPlayer.values()) {
  console.log(`  ${l.player} ${l.threshold}+ ${l.stat} (${l.team})`);
}
