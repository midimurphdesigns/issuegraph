/**
 * Checkpointer factory for the demo API.
 *
 * interrupt() requires checkpoints to survive between the request that
 * pauses the graph and the request that resumes it. On Vercel those are
 * different lambda invocations, so memory is not enough:
 *
 *   REDIS_URL set  -> RedisSaver (shared across instances; production)
 *   otherwise      -> MemorySaver singleton (local dev fallback)
 */
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";

let saver: BaseCheckpointSaver | null = null;

export async function getCheckpointer(): Promise<BaseCheckpointSaver> {
  if (saver) return saver;
  const url = process.env.REDIS_URL;
  if (url) {
    saver = await RedisSaver.fromUrl(url, {
      defaultTTL: 60, // minutes; demo threads are short-lived
    });
  } else {
    saver = new MemorySaver();
  }
  return saver;
}
