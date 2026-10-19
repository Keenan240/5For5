import { canonicalTeamAbbrev } from "./h2h";
import { nbaTeamId } from "./nba-teams";

/** ESPN /i/teamlogos/nba/500/{slug}.png */
const ESPN_LOGO_SLUG: Record<string, string> = {
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

/** Prefer ESPN PNG (reliable in <img>); NBA CDN SVG often fails in browsers. */
export function teamLogoUrl(abbrev: string, size = 72): string {
  const tri = canonicalTeamAbbrev(abbrev);
  const slug = ESPN_LOGO_SLUG[tri] ?? tri.toLowerCase();
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${slug}.png&h=${size}&w=${size}`;
}

export function teamLogoUrlNbaCdn(abbrev: string): string | null {
  const id = nbaTeamId(canonicalTeamAbbrev(abbrev));
  if (!id) return null;
  return `https://cdn.nba.com/logos/nba/${id}/primary/L/logo.svg`;
}
