/** ESPN CDN headshot (no auth). */
export function espnHeadshotUrl(espnAthleteId: string, size = 96): string {
  const id = espnAthleteId.trim();
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=${size}&h=${size}&scale=crop`;
}
