/**
 * Minimal LangGraph checkpointer over the Upstash Redis REST API.
 *
 * Why this exists: the official `@langchain/langgraph-checkpoint-redis`
 * saver requires the RediSearch module (FT.CREATE), which serverless
 * Redis providers like Upstash do not support. This saver implements
 * the same `BaseCheckpointSaver` contract with plain key/value commands
 * only, so pause-and-resume works on any Redis.
 *
 * Storage layout (all keys TTL'd — demo threads are short-lived):
 *   ig:ckpt:{thread}:{ns}:{id}    one checkpoint (serialized)
 *   ig:latest:{thread}:{ns}       id of the newest checkpoint
 *   ig:writes:{thread}:{ns}:{id}  pending writes attached to a checkpoint
 *
 * Scope: enough for invoke/stream + interrupt/resume on a single thread.
 * `list` yields only the latest checkpoint (no history walking), which is
 * all the demo's resume path needs.
 */
import { Redis } from "@upstash/redis";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type ChannelVersions,
  type PendingWrite,
  WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

const TTL_SECONDS = 60 * 60; // 1 hour, matches demo thread lifetime

type StoredCheckpoint = {
  checkpoint: [string, string]; // [serde type, base64 payload]
  metadata: [string, string];
  parentId: string | null;
};

type StoredWrite = {
  taskId: string;
  channel: string;
  value: [string, string];
  idx: number;
};

function b64encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export class UpstashSaver extends BaseCheckpointSaver {
  private redis: Redis;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  private keys(config: RunnableConfig) {
    const thread = config.configurable?.thread_id as string;
    const ns = (config.configurable?.checkpoint_ns as string) ?? "";
    return {
      thread,
      ns,
      ckpt: (id: string) => `ig:ckpt:${thread}:${ns}:${id}`,
      latest: `ig:latest:${thread}:${ns}`,
      writes: (id: string) => `ig:writes:${thread}:${ns}:${id}`,
    };
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const k = this.keys(config);
    if (!k.thread) return undefined;

    const id =
      (config.configurable?.checkpoint_id as string | undefined) ??
      (await this.redis.get<string>(k.latest)) ??
      undefined;
    if (!id) return undefined;

    const stored = await this.redis.get<StoredCheckpoint>(k.ckpt(id));
    if (!stored) return undefined;

    const checkpoint = (await this.serde.loadsTyped(
      stored.checkpoint[0],
      b64decode(stored.checkpoint[1]),
    )) as Checkpoint;
    const metadata = (await this.serde.loadsTyped(
      stored.metadata[0],
      b64decode(stored.metadata[1]),
    )) as CheckpointMetadata;

    const rawWrites =
      (await this.redis.get<StoredWrite[]>(k.writes(id))) ?? [];
    const pendingWrites: Array<[string, string, unknown]> = [];
    for (const w of rawWrites) {
      pendingWrites.push([
        w.taskId,
        w.channel,
        await this.serde.loadsTyped(w.value[0], b64decode(w.value[1])),
      ]);
    }

    return {
      config: {
        configurable: {
          thread_id: k.thread,
          checkpoint_ns: k.ns,
          checkpoint_id: id,
        },
      },
      checkpoint,
      metadata,
      parentConfig: stored.parentId
        ? {
            configurable: {
              thread_id: k.thread,
              checkpoint_ns: k.ns,
              checkpoint_id: stored.parentId,
            },
          }
        : undefined,
      pendingWrites,
    };
  }

  async *list(
    config: RunnableConfig,
    _options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    // Demo scope: only the latest checkpoint per thread.
    const tuple = await this.getTuple({
      configurable: {
        thread_id: config.configurable?.thread_id,
        checkpoint_ns: config.configurable?.checkpoint_ns ?? "",
      },
    });
    if (tuple) yield tuple;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const k = this.keys(config);
    const [ct, cb] = await this.serde.dumpsTyped(checkpoint);
    const [mt, mb] = await this.serde.dumpsTyped(metadata);

    const stored: StoredCheckpoint = {
      checkpoint: [ct, b64encode(cb)],
      metadata: [mt, b64encode(mb)],
      parentId: (config.configurable?.checkpoint_id as string) ?? null,
    };

    await this.redis.set(k.ckpt(checkpoint.id), stored, { ex: TTL_SECONDS });
    await this.redis.set(k.latest, checkpoint.id, { ex: TTL_SECONDS });

    return {
      configurable: {
        thread_id: k.thread,
        checkpoint_ns: k.ns,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const k = this.keys(config);
    const id = config.configurable?.checkpoint_id as string;
    if (!id) return;

    const existing = (await this.redis.get<StoredWrite[]>(k.writes(id))) ?? [];
    for (let i = 0; i < writes.length; i++) {
      const [channel, value] = writes[i]!;
      const [vt, vb] = await this.serde.dumpsTyped(value);
      existing.push({
        taskId,
        channel,
        value: [vt, b64encode(vb)],
        idx: WRITES_IDX_MAP[channel] ?? i,
      });
    }
    await this.redis.set(k.writes(id), existing, { ex: TTL_SECONDS });
  }

  async deleteThread(threadId: string): Promise<void> {
    // Demo threads expire via TTL; explicit delete removes the latest chain.
    const latestKey = `ig:latest:${threadId}:`;
    const id = await this.redis.get<string>(latestKey);
    if (id) {
      await this.redis.del(
        `ig:ckpt:${threadId}::${id}`,
        `ig:writes:${threadId}::${id}`,
        latestKey,
      );
    }
  }
}
