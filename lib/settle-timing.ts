import { promises as fs } from "fs";
import path from "path";
import { getRedis } from "./kv";

const KEY_PREFIX = "settle_all_final_at:";
const LOCAL_PATH = path.join(process.cwd(), ".data", "settle_timing.json");

function redisKey(slateDate: string): string {
  return `${KEY_PREFIX}${slateDate}`;
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

/** When all slate games first became Final (ISO). Does not touch parlay_state. */
export async function getAllFinalAt(slateDate: string): Promise<Date | null> {
  const redis = getRedis();
  if (redis) {
    const iso = await redis.get<string>(redisKey(slateDate));
    return iso ? new Date(iso) : null;
  }

  const map = await readLocalMap();
  const iso = map[slateDate];
  return iso ? new Date(iso) : null;
}

export async function markAllFinalAt(
  slateDate: string,
  at: Date
): Promise<void> {
  const existing = await getAllFinalAt(slateDate);
  if (existing) return;

  const iso = at.toISOString();
  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(slateDate), iso);
    return;
  }

  const map = await readLocalMap();
  map[slateDate] = iso;
  await writeLocalMap(map);
}
