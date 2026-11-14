import type { Collection, MongoClient } from 'mongodb';
import { connectGraphRepository } from '../../db/graphRepository.ts';
import { DatasetSource } from '../../data/dataset.ts';
import type { ModelProvider } from '../../llm/provider.ts';
import { GraphService } from './service.ts';

type Lease = { _id: string; owner: string; until: Date };
/** MongoDB initialization is isolated from the live lecture API's startup/lifecycle. */
export function startGraphRuntime(mongo: { uri: string; database: string }, provider: ModelProvider, onUnavailable: (message: string) => void) {
  const owner = crypto.randomUUID();
  let service: GraphService | undefined;
  let client: MongoClient | undefined;
  let locks: Collection<Lease> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closing = false;
  let releasing: Promise<void> | undefined;
  const release = () => releasing ??= (async () => {
    if (heartbeat) clearInterval(heartbeat);
    const running = service; service = undefined;
    try { await running?.close(); }
    finally {
      try { await locks?.deleteOne({ _id: 'local-worker', owner }); }
      finally { await client?.close(); }
    }
  })().catch(error => {
    onUnavailable('Graph cleanup failed: ' + (error instanceof Error ? error.message : 'unknown error'));
  });
  const ready = (async () => {
    try {
      const connected = await connectGraphRepository(mongo.uri, mongo.database);
      client = connected.client;
      locks = client.db(mongo.database).collection<Lease>('graphWorkerLease');
      const acquire = async () => {
        const lease = await locks!.findOneAndUpdate({ _id: 'local-worker', $or: [{ owner }, { until: { $lt: new Date() } }] },
          { $set: { owner, until: new Date(Date.now() + 30000) } }, { upsert: true, returnDocument: 'after' });
        if (lease?.owner !== owner) throw new Error('Another graph API worker is running.');
      };
      try { await acquire(); }
      catch { throw new Error('Another graph worker is running. Stop it or wait 30 seconds after an unexpected exit.'); }
      if (closing) { await release(); return; }
      service = new GraphService(connected.repository, new DatasetSource(), provider);
      heartbeat = setInterval(() => {
        acquire().catch(async () => {
          onUnavailable('Graph worker lease lost; live lecture remains available.');
          await release();
        });
      }, 10000);
      heartbeat.unref();
      await service.recover();
    } catch (error) {
      await release();
      onUnavailable('Knowledge graph unavailable: ' + (error instanceof Error ? error.message : 'MongoDB initialization failed') + '. Start MongoDB and restart the API.');
    }
  })();
  return {
    getService: () => service,
    ready,
    close: async () => { closing = true; await ready; await release(); },
  };
}
