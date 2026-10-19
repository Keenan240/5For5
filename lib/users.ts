import { getRedis } from "./kv";

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  image?: string;
  /** Public display handle for leaderboard (defaults from name/email). */
  handle: string;
  createdAt: string;
  /** Opt into community leaderboard (default true). */
  leaderboardOptIn: boolean;
};

const USER_KEY = (id: string) => `user:${id}`;
const EMAIL_KEY = (email: string) =>
  `user:email:${email.trim().toLowerCase()}`;

function slugHandle(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return base || "player";
}

export async function getUser(id: string): Promise<UserProfile | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<UserProfile>(USER_KEY(id))) ?? null;
}

export async function getUserByEmail(
  email: string
): Promise<UserProfile | null> {
  const redis = getRedis();
  if (!redis) return null;
  const id = await redis.get<string>(EMAIL_KEY(email));
  if (!id) return null;
  return getUser(id);
}

export async function upsertGoogleUser(input: {
  email: string;
  name?: string | null;
  image?: string | null;
  providerAccountId: string;
}): Promise<UserProfile> {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Database not connected — cannot create account.");
  }

  const email = input.email.trim().toLowerCase();
  const existingId = await redis.get<string>(EMAIL_KEY(email));
  if (existingId) {
    const existing = await getUser(existingId);
    if (existing) {
      const next: UserProfile = {
        ...existing,
        name: input.name?.trim() || existing.name,
        image: input.image || existing.image,
      };
      await redis.set(USER_KEY(existing.id), next);
      return next;
    }
  }

  const id = `google_${input.providerAccountId}`;
  const name = input.name?.trim() || email.split("@")[0] || "Player";
  const handle = slugHandle(name);
  const profile: UserProfile = {
    id,
    email,
    name,
    image: input.image || undefined,
    handle,
    createdAt: new Date().toISOString(),
    leaderboardOptIn: true,
  };
  await redis.set(USER_KEY(id), profile);
  await redis.set(EMAIL_KEY(email), id);
  return profile;
}

export async function updateHandle(
  userId: string,
  handle: string
): Promise<UserProfile | null> {
  const redis = getRedis();
  if (!redis) return null;
  const user = await getUser(userId);
  if (!user) return null;
  const cleaned = slugHandle(handle);
  const next = { ...user, handle: cleaned };
  await redis.set(USER_KEY(userId), next);
  return next;
}
