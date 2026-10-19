import { getRedis } from "./kv";
import { formatAmerican } from "./odds";
import { weekStartSunday } from "./week-record";
import { getTodayEastern, addDaysYmd, formatDisplayDate } from "./dates";
import type { PendingParlay, SettledParlay, StatCategory } from "./types";
import type { UserProfile } from "./users";

const FEED_ALL = "community:feed";
const FEED_WEEK = (weekStart: string) => `community:week:${weekStart}`;
const FEED_ITEM = (id: string) => `community:item:${id}`;
const FEED_WEEKS = "community:weeks";

export type CommunityFeedLeg = {
  player: string;
  team: string;
  stat: StatCategory;
  threshold: number;
  odds: number;
  espnAthleteId?: string;
};

export type CommunityFeedStatus = "pending" | "win" | "loss";

export type CommunityFeedItem = {
  id: string;
  userId: string;
  handle: string;
  name: string;
  image?: string;
  /** Slate night YYYY-MM-DD */
  date: string;
  weekStart: string;
  placedAt: string;
  stake: number;
  parlayOdds: number;
  potentialPayout: number;
  legs: CommunityFeedLeg[];
  status: CommunityFeedStatus;
  settledAt?: string;
  profit?: number;
};

export type CommunityWeekGroup = {
  weekStart: string;
  weekEnd: string;
  label: string;
  count: number;
};

function feedId(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function scoreFromIso(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function legsFromPending(p: PendingParlay): CommunityFeedLeg[] {
  return p.legs.map((l) => ({
    player: l.player,
    team: l.team,
    stat: l.stat,
    threshold: l.threshold,
    odds: l.odds,
    espnAthleteId: l.espnAthleteId,
  }));
}

export function weekRangeLabel(weekStart: string): string {
  const weekEnd = addDaysYmd(weekStart, 6);
  const start = formatDisplayDate(weekStart);
  const end = formatDisplayDate(weekEnd);
  // "May 11, 2025 – May 17, 2025" → tighten same-month when possible
  const startParts = weekStart.split("-");
  const endParts = weekEnd.split("-");
  if (
    startParts[0] === endParts[0] &&
    startParts[1] === endParts[1]
  ) {
    const shortStart = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${weekStart}T12:00:00Z`));
    const shortEnd = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${weekEnd}T12:00:00Z`));
    return `${shortStart} – ${shortEnd}`;
  }
  return `${start} – ${end}`;
}

/** Publish a placed slip to the public community feed. */
export async function publishCommunityPlacement(
  user: UserProfile,
  pending: PendingParlay,
  placedAt: string = new Date().toISOString()
): Promise<void> {
  if (!user.leaderboardOptIn) return;
  const redis = getRedis();
  if (!redis) return;

  const weekStart = weekStartSunday(pending.date);
  const id = feedId(user.id, pending.date);
  const item: CommunityFeedItem = {
    id,
    userId: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
    date: pending.date,
    weekStart,
    placedAt,
    stake: pending.stake,
    parlayOdds: pending.parlayOdds,
    potentialPayout: pending.potentialPayout,
    legs: legsFromPending(pending),
    status: "pending",
  };

  const score = scoreFromIso(placedAt);
  await Promise.all([
    redis.set(FEED_ITEM(id), item),
    redis.zadd(FEED_ALL, { score, member: id }),
    redis.zadd(FEED_WEEK(weekStart), { score, member: id }),
    redis.zadd(FEED_WEEKS, { score: scoreFromIso(`${weekStart}T12:00:00Z`), member: weekStart }),
  ]);
}

/** Update feed item after settle (or remove if user opted out). */
export async function settleCommunityFeedItem(
  user: UserProfile,
  settled: SettledParlay
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const id = feedId(user.id, settled.date);
  const existing = await redis.get<CommunityFeedItem>(FEED_ITEM(id));
  if (!existing) {
    // Slip may predate feed — publish as settled if opted in.
    if (!user.leaderboardOptIn) return;
    const weekStart = weekStartSunday(settled.date);
    const placedAt = new Date().toISOString();
    const item: CommunityFeedItem = {
      id,
      userId: user.id,
      handle: user.handle,
      name: user.name,
      image: user.image,
      date: settled.date,
      weekStart,
      placedAt,
      stake: settled.stake,
      parlayOdds: settled.parlayOdds,
      potentialPayout: settled.payout,
      legs: settled.legs.map((l) => ({
        player: l.player,
        team: l.team,
        stat: l.stat,
        threshold: l.threshold,
        odds: l.odds,
        espnAthleteId: l.espnAthleteId,
      })),
      status: settled.result,
      settledAt: placedAt,
      profit: settled.profit,
    };
    const score = scoreFromIso(placedAt);
    await Promise.all([
      redis.set(FEED_ITEM(id), item),
      redis.zadd(FEED_ALL, { score, member: id }),
      redis.zadd(FEED_WEEK(weekStart), { score, member: id }),
      redis.zadd(FEED_WEEKS, {
        score: scoreFromIso(`${weekStart}T12:00:00Z`),
        member: weekStart,
      }),
    ]);
    return;
  }

  if (!user.leaderboardOptIn) {
    await removeCommunityFeedItem(user.id, settled.date);
    return;
  }

  const next: CommunityFeedItem = {
    ...existing,
    handle: user.handle,
    name: user.name,
    image: user.image,
    status: settled.result,
    settledAt: new Date().toISOString(),
    profit: settled.profit,
    potentialPayout: settled.payout,
  };
  await redis.set(FEED_ITEM(id), next);
}

/** After revert-settle, mark the feed card as open again. */
export async function reopenCommunityFeedItem(
  user: UserProfile,
  pending: PendingParlay
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  if (!user.leaderboardOptIn) return;

  const id = feedId(user.id, pending.date);
  const existing = await redis.get<CommunityFeedItem>(FEED_ITEM(id));
  if (existing) {
    const next: CommunityFeedItem = {
      ...existing,
      handle: user.handle,
      name: user.name,
      image: user.image,
      status: "pending",
      settledAt: undefined,
      profit: undefined,
      stake: pending.stake,
      parlayOdds: pending.parlayOdds,
      potentialPayout: pending.potentialPayout,
      legs: legsFromPending(pending),
    };
    await redis.set(FEED_ITEM(id), next);
    return;
  }
  await publishCommunityPlacement(user, pending);
}

export async function removeCommunityFeedItem(
  userId: string,
  date: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const id = feedId(userId, date);
  const existing = await redis.get<CommunityFeedItem>(FEED_ITEM(id));
  const weekStart = existing?.weekStart ?? weekStartSunday(date);

  await Promise.all([
    redis.del(FEED_ITEM(id)),
    redis.zrem(FEED_ALL, id),
    redis.zrem(FEED_WEEK(weekStart), id),
  ]);
}

export async function getCommunityFeed(opts: {
  scope: "week" | "lifetime";
  weekStart?: string;
  limit?: number;
}): Promise<CommunityFeedItem[]> {
  const redis = getRedis();
  if (!redis) return [];

  const limit = Math.min(50, Math.max(1, opts.limit ?? 40));
  const key =
    opts.scope === "week"
      ? FEED_WEEK(opts.weekStart ?? weekStartSunday(getTodayEastern()))
      : opts.weekStart
        ? FEED_WEEK(opts.weekStart)
        : FEED_ALL;

  const ids = await redis.zrange<string[]>(key, 0, limit - 1, { rev: true });
  if (!ids?.length) return [];

  const items: CommunityFeedItem[] = [];
  for (const id of ids) {
    const item = await redis.get<CommunityFeedItem>(FEED_ITEM(id));
    if (item) items.push(item);
  }
  return items;
}

export async function listCommunityWeeks(limit = 24): Promise<CommunityWeekGroup[]> {
  const redis = getRedis();
  if (!redis) return [];

  const starts = await redis.zrange<string[]>(FEED_WEEKS, 0, Math.max(0, limit - 1), {
    rev: true,
  });
  if (!starts?.length) return [];

  const groups: CommunityWeekGroup[] = [];
  for (const weekStart of starts) {
    const count = (await redis.zcard(FEED_WEEK(weekStart))) ?? 0;
    if (count <= 0) continue;
    groups.push({
      weekStart,
      weekEnd: addDaysYmd(weekStart, 6),
      label: weekRangeLabel(weekStart),
      count,
    });
  }
  return groups;
}

/** Short odds line for compact feed cards. */
export function feedOddsLabel(odds: number): string {
  return formatAmerican(odds);
}
