import { config } from './config.ts';
import { connectGraphRepository } from './db/graphRepository.ts';
import { DatasetSource } from './data/dataset.ts';
import { DeepSeekProvider } from './llm/deepseek.ts';
import { GraphService } from './features/graph/service.ts';
import { createApp } from './app.ts';

try {
  const { client, repository } = await connectGraphRepository(config.MONGODB_URI, config.MONGODB_DB);
  // One local indexing worker owns publication. A database lease prevents two API
  // processes from overwriting each other's course versions.
  const locks = client.db(config.MONGODB_DB).collection<{ _id: string; owner: string; until: Date }>('graphWorkerLease');
  const owner = crypto.randomUUID();
  const acquire = async () => {
    const lease = await locks.findOneAndUpdate({ _id: 'local-worker', $or: [{ owner }, { until: { $lt: new Date() } }] },
      { $set: { owner, until: new Date(Date.now() + 30000) } }, { upsert: true, returnDocument: 'after' });
    if (lease?.owner !== owner) throw new Error('Another graph API worker is running.');
  };
  try { await acquire(); }
  catch { await client.close(); throw new Error('Another graph API worker is running. Stop it or wait 30 seconds after an unexpected exit.'); }
  const service = new GraphService(repository, new DatasetSource(), new DeepSeekProvider({
    key: config.DEEPSEEK_API_KEY, model: config.LLM_MODEL, baseUrl: config.DEEPSEEK_BASE_URL,
  }));
  const app = createApp(service, Boolean(config.DEEPSEEK_API_KEY));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true; clearInterval(heartbeat);
    await app.close(); await service.close();
    await locks.deleteOne({ _id: 'local-worker', owner }); await client.close();
  };
  const heartbeat = setInterval(() => { acquire().catch(async () => { console.error('Graph worker lease lost. Shutting down.'); await close(); process.exitCode = 1; }); }, 10000);
  heartbeat.unref();
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  try {
    await service.recover();
    await app.listen({ port: config.PORT, host: '127.0.0.1' });
  } catch (error) { await close(); throw error; }
  if (!config.DEEPSEEK_API_KEY) app.log.warn('Add DEEPSEEK_API_KEY to .env and restart to enable extraction. Existing graphs remain readable.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error('Start MongoDB with npm run db:start, then run npm run dev.');
  process.exitCode = 1;
}
