/**
 * Checkpointer factory for the demo API.
 *
 * interrupt() requires checkpoints to survive between the request that
 * pauses the graph and the request that resumes it. On Vercel those are
 * different lambda invocations, so memory is not enough:
 *
 *   Redis reachable -> RedisSaver (shared across instances; production)
 *   otherwise       -> MemorySaver singleton (local dev fallback)
 *
 * Connection resolution: REDIS_URL wins when set. Otherwise the TCP URL
 * is derived from the standard Upstash REST vars — for Upstash databases
 * the REST token doubles as the Redis password and TLS runs on 6379, so
 * UPSTASH_REDIS_REST_URL=https://<host> + token becomes
 * rediss://default:<token>@<host>:6379. One pair of env vars drives both
 * the rate limiter (REST) and the checkpointer (TCP).
 */
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

function resolveRedisUrl(): string | null {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const rest = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (rest && token) {
    const host = new URL(rest).host;
    return `rediss://default:${token}@${host}:6379`;
  }
  return null;
}

let saver: BaseCheckpointSaver | null = null;

export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (saver) return saver;
  const url = resolveRedisUrl();
  if (url) {
    saver = await RedisSaver.fromUrl(url, {
      defaultTTL: 60, // minutes; demo threads are short-lived
    });
  } else {
    saver = new MemorySaver();
  }
  return saver;
}
