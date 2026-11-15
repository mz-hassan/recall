import { setTimeout as delay } from 'node:timers/promises';
import type { Collection, MongoClient } from 'mongodb';
import { connectGraphRepository } from '../../db/graphRepository.ts';
import { DatasetSource } from '../../data/dataset.ts';
import type { ModelProvider } from '../../llm/provider.ts';
import { GraphService } from './service.ts';

type Lease = { _id: string; owner: string; until: Date };
const RETRY_MS = 5_000;
const HEARTBEAT_MS = 10_000;
const LEASE_MS = 30_000;

/** Keeps the graph worker independent of the live lecture API and reconnects after outages. */
export function startGraphRuntime(mongo: { uri: string; database: string }, provider: ModelProvider, onUnavailable: (message: string) => void) {
  const owner = crypto.randomUUID();
  const shutdown = new AbortController();
  const { signal } = shutdown;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  let service: GraphService | undefined;

  async function acquire(locks: Collection<Lease>) {
    const now = Date.now();
    await locks.findOneAndUpdate(
      { _id: 'local-worker', $or: [{ owner }, { until: { $lt: new Date(now) } }] },
      { $set: { owner, until: new Date(now + LEASE_MS) } },
      { upsert: true, returnDocument: 'after', timeoutMS: 5000 },
    );
  }

  async function runConnection() {
    let client: MongoClient | undefined;
    let locks: Collection<Lease> | undefined;
    let worker: GraphService | undefined;
    try {
      const connected = await connectGraphRepository(mongo.uri, mongo.database);
      client = connected.client;
      signal.throwIfAborted();
      locks = client.db(mongo.database).collection<Lease>('graphWorkerLease');
      await acquire(locks);
      signal.throwIfAborted();
      worker = new GraphService(connected.repository, new DatasetSource(), provider);
      await worker.recover();
      signal.throwIfAborted();
      service = worker;
      resolveReady();

      while (!signal.aborted) {
        await delay(HEARTBEAT_MS, undefined, { signal, ref: false });
        await acquire(locks);
      }
    } catch (error) {
      if (!signal.aborted) {
        const message = error instanceof Error ? error.message : 'MongoDB connection failed';
        onUnavailable('Knowledge graph unavailable: ' + message + '. Retrying automatically.');
      }
    } finally {
      service = undefined;
      resolveReady();
      try {
        await worker?.close();
      } finally {
        try {
          // The owner filter prevents a disconnected worker from removing a successor's lease.
          await locks?.deleteOne({ _id: 'local-worker', owner }, { timeoutMS: 5000 });
        } finally {
          await client?.close();
        }
      }
    }
  }

  const running = (async () => {
    while (!signal.aborted) {
      await runConnection().catch(error => {
        if (!signal.aborted) onUnavailable('Graph cleanup failed: ' + (error instanceof Error ? error.message : 'unknown error'));
      });
      if (!signal.aborted) {
        await delay(RETRY_MS, undefined, { signal, ref: false }).catch(() => {});
      }
    }
  })();

  return {
    getService: () => service,
    ready,
    async close() {
      shutdown.abort();
      await running;
    },
  };
}
