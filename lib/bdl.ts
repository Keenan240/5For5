import type { GameLog } from "./types";
import { bdlHeaders, hasBdlKey, nbaSeasonYear } from "./bdl-client";
import { fetchJson } from "./fetch";
import { getLast5Games } from "./stats";

const BASE = "https://api.balldontlie.io/v1";

type BdlPlayer = {
  id: number;
  first_name: string;
  last_name: string;
};

export { hasBdlKey };

export async function searchPlayer(name: string): Promise<BdlPlayer | null> {
  if (!hasBdlKey()) return null;
  const result = await fetchJson<{ data: BdlPlayer[] }>(
    `${BASE}/players?search=${encodeURIComponent(name)}&per_page=10`,
    { headers: bdlHeaders() }
  );
  if (!result.ok || !result.data) return null;
  const parts = name.toLowerCase().split(" ");
  return (
    result.data.data.find((p) => {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase();
      return parts.every((part) => full.includes(part));
    }) ?? null
  );
}

/** BDL stats endpoint is not available on free tier (401) — use NBA stats */
export async function getBdlLast5PlayoffGames(_playerName: string): Promise<GameLog[]> {
  return [];
}

export async function getPlayerLogs(playerName: string): Promise<GameLog[]> {
  return getLast5Games(playerName);
}
