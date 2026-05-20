import { fetchJson } from "./fetch";
import type { TonightPlayer } from "./scoring";

/** ESPN team slug by tricode (current-season roster pages) */
const ESPN_TEAM_SLUG: Record<string, string> = {
  ATL: "atl",
  BOS: "bos",
  BKN: "bkn",
  CHA: "cha",
  CHI: "chi",
  CLE: "cle",
  DAL: "dal",
  DEN: "den",
  DET: "det",
  GSW: "gs",
  HOU: "hou",
  IND: "ind",
  LAC: "lac",
  LAL: "lal",
  MEM: "mem",
  MIA: "mia",
  MIL: "mil",
  MIN: "min",
  NOP: "no",
  NYK: "ny",
  OKC: "okc",
  ORL: "orl",
  PHI: "phi",
  PHX: "phx",
  POR: "por",
  SAC: "sac",
  SAS: "sa",
  TOR: "tor",
  UTA: "utah",
  WAS: "wsh",
};

type EspnRosterResponse = {
  athletes?: {
    displayName?: string;
    fullName?: string;
    status?: { type?: string; name?: string };
  }[];
};

function isEspnPlayerOut(status?: { type?: string; name?: string }): boolean {
  const type = status?.type?.toLowerCase() ?? "";
  const name = status?.name?.trim().toUpperCase() ?? "";
  return type === "out" || name === "OUT";
}

/** Live roster from ESPN (updates with trades; does not time out like stats.nba.com) */
export async function fetchRostersFromEspn(
  abbrevs: string[]
): Promise<TonightPlayer[]> {
  const players: TonightPlayer[] = [];

  await Promise.all(
    abbrevs.map(async (abbrev) => {
      const slug = ESPN_TEAM_SLUG[abbrev.toUpperCase()];
      if (!slug) return;

      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${slug}/roster`;
      const result = await fetchJson<EspnRosterResponse>(url, undefined, 12_000);
      if (!result.ok || !result.data?.athletes) return;

      for (const a of result.data.athletes) {
        const name = (a.displayName || a.fullName || "").trim();
        if (!name) continue;
        const statusType = a.status?.type?.toLowerCase() ?? "";
        if (statusType === "inactive" || isEspnPlayerOut(a.status)) continue;
        players.push({ player: name, team: abbrev.toUpperCase() });
      }
    })
  );

  const seen = new Set<string>();
  return players.filter((p) => {
    const key = `${p.player}|${p.team}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
