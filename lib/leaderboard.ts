import { getRedis } from "./kv";
import type { ParlayState } from "./types";
import { getUser, type UserProfile } from "./users";
import { weekStartSunday } from "./week-record";
import { getTodayEastern } from "./dates";

const LB_LIFETIME = "leaderboard:lifetime";
const LB_WEEK = (weekStart: string) => `leaderboard:week:${weekStart}`;
const LB_STATS = (userId: string) => `leaderboard:stats:${userId}`;

export type LeaderboardStats = {
  userId: string;
  wins: number;
  losses: number;
  weekWins: number;
  weekLosses: number;
  updatedAt: string;
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  handle: string;
  name: string;
  image?: string;
  wins: number;
  losses: number;
  weekWins: number;
  weekLosses: number;
};

function scoreFromStats(wins: number, losses: number): number {
  // Primary: wins. Tie-break: win rate (0–999).
  const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 999) : 0;
  return wins * 1000 + rate;
}

export function statsFromState(
  userId: string,
  state: ParlayState,
  weekAnchor: string = getTodayEastern()
): LeaderboardStats {
  const weekStart = weekStartSunday(weekAnchor);
  let wins = 0;
  let losses = 0;
  let weekWins = 0;
  let weekLosses = 0;
  for (const h of state.history) {
    if (h.result === "win") {
      wins += 1;
      if (h.date >= weekStart) weekWins += 1;
    } else {
      losses += 1;
      if (h.date >= weekStart) weekLosses += 1;
    }
  }
  return {
    userId,
    wins,
    losses,
    weekWins,
    weekLosses,
    updatedAt: new Date().toISOString(),
  };
}

/** Recompute and publish a user's public record after settle/history changes. */
export async function syncLeaderboardForUser(
  user: UserProfile,
  state: ParlayState
): Promise<void> {
  if (!user.leaderboardOptIn) return;
  const redis = getRedis();
  if (!redis) return;

  const stats = statsFromState(user.id, state);
  const weekStart = weekStartSunday(getTodayEastern());
  const lifetimeScore = scoreFromStats(stats.wins, stats.losses);
  const weekScore = scoreFromStats(stats.weekWins, stats.weekLosses);

  await Promise.all([
    redis.set(LB_STATS(user.id), stats),
    redis.zadd(LB_LIFETIME, { score: lifetimeScore, member: user.id }),
    redis.zadd(LB_WEEK(weekStart), { score: weekScore, member: user.id }),
  ]);
}

export async function getLeaderboard(
  scope: "lifetime" | "week" = "lifetime",
  limit = 25
): Promise<LeaderboardRow[]> {
  const redis = getRedis();
  if (!redis) return [];

  const key =
    scope === "week" ? LB_WEEK(weekStartSunday(getTodayEastern())) : LB_LIFETIME;

  // Highest scores first
  const ids = await redis.zrange<string[]>(key, 0, Math.max(0, limit - 1), {
    rev: true,
  });
  if (!ids?.length) return [];

  const rows: LeaderboardRow[] = [];
  let rank = 1;
  for (const userId of ids) {
    const [user, stats] = await Promise.all([
      getUser(userId),
      redis.get<LeaderboardStats>(LB_STATS(userId)),
    ]);
    if (!user || !user.leaderboardOptIn) continue;
    rows.push({
      rank: rank++,
      userId,
      handle: user.handle,
      name: user.name,
      image: user.image,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      weekWins: stats?.weekWins ?? 0,
      weekLosses: stats?.weekLosses ?? 0,
    });
  }
  return rows;
}
