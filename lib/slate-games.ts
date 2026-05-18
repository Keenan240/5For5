import type { TonightSlate } from "./tonight";

export type GameMatchup = { away: string; home: string };

export function gameKey(g: GameMatchup): string {
  return `${g.away.toUpperCase()}@${g.home.toUpperCase()}`;
}

export function teamsForGames(games: GameMatchup[]): Set<string> {
  const teams = new Set<string>();
  for (const g of games) {
    teams.add(g.away.toUpperCase());
    teams.add(g.home.toUpperCase());
  }
  return teams;
}

/** Keep only players on teams playing in the given games. */
export function filterSlateByIncludedGames(
  slate: TonightSlate,
  includedGames: GameMatchup[]
): TonightSlate {
  if (includedGames.length === 0) {
    return {
      ...slate,
      games: [],
      players: [],
      teamIds: [],
    };
  }

  const teams = teamsForGames(includedGames);
  const includedKeys = new Set(includedGames.map(gameKey));

  return {
    ...slate,
    games: slate.games.filter((g) => includedKeys.has(gameKey(g))),
    players: slate.players.filter((p) => teams.has(p.team.toUpperCase())),
    teamIds: slate.teamIds,
  };
}

/** Opponent tricode for a team on tonight's included slate. */
export function opponentForTeam(
  teamAbbrev: string,
  games: GameMatchup[]
): string | null {
  const t = teamAbbrev.toUpperCase();
  for (const g of games) {
    if (g.away.toUpperCase() === t) return g.home.toUpperCase();
    if (g.home.toUpperCase() === t) return g.away.toUpperCase();
  }
  return null;
}

export function allGamesIncluded(
  slate: TonightSlate,
  includedGames: GameMatchup[]
): boolean {
  if (includedGames.length !== slate.games.length) return false;
  const keys = new Set(includedGames.map(gameKey));
  return slate.games.every((g) => keys.has(gameKey(g)));
}
