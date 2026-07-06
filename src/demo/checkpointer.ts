/**
 * Checkpointer factory for the demo API.
 *
 * interrupt() requires checkpoints to survive between the request that
 * pauses the graph and the request that resumes it. On Vercel those are
 * different lambda invocations, so memory is not enough:
 *
 *   Upstash REST vars set -> UpstashSaver (shared across instances)
 *   otherwise             -> MemorySaver singleton (local dev fallback)
 *
 * Why a custom saver: the official `@langchain/langgraph-checkpoint-redis`
 * package requires the RediSearch module (FT.CREATE), which Upstash and
 * most serverless Redis providers do not support. UpstashSaver implements
 * the BaseCheckpointSaver contract with plain key/value commands, reusing
 * the same REST env vars the rate limiter uses.
 */
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { Redis } from "@upstash/redis";
import { UpstashSaver } from "./upstash-saver";

let saver: BaseCheckpointSaver | null = null;

export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (saver) return saver;
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    saver = new UpstashSaver(Redis.fromEnv());
  } else {
    saver = new MemorySaver();
  }
  return saver;
}
