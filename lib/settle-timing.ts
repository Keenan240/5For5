import { promises as fs } from "fs";
import path from "path";
import { getRedis } from "./kv";

const LOCAL_PATH = path.join(process.cwd(), ".data", "settle_timing.json");

function deferredKey(slateDate: string): string {
  return `deferred_until:${slateDate}`;
}

async function readLocalMap(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeLocalMap(map: Record<string, string>): Promise<void> {
  const dir = path.dirname(LOCAL_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(map, null, 2));
}

export async function getSettleDeferredUntil(
  slateDate: string
): Promise<Date | null> {
  const key = deferredKey(slateDate);
  const redis = getRedis();
  if (redis) {
    const iso = await redis.get<string>(key);
    if (!iso) return null;
    const date = new Date(iso);
    if (date.getTime() <= Date.now()) {
      await redis.del(key);
      return null;
    }
    return date;
  }

  const map = await readLocalMap();
  const iso = map[key];
  if (!iso) return null;
  const date = new Date(iso);
  if (date.getTime() <= Date.now()) {
    delete map[key];
    await writeLocalMap(map);
    return null;
  }
  return date;
}

export async function setSettleDeferredUntil(
  slateDate: string,
  until: Date
): Promise<void> {
  const key = deferredKey(slateDate);
  const iso = until.toISOString();
  const redis = getRedis();
  if (redis) {
    await redis.set(key, iso);
    return;
  }

  const map = await readLocalMap();
  map[key] = iso;
  await writeLocalMap(map);
}

export async function clearSettleDeferredUntil(
  slateDate: string
): Promise<void> {
  const key = deferredKey(slateDate);
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }

  const map = await readLocalMap();
  delete map[key];
  await writeLocalMap(map);
}
