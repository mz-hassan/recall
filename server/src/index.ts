import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createGraphProvider, createProvider } from './llm/index.ts';
import { startGraphRuntime } from './features/graph/runtime.ts';
import { createPlatformRepository } from './platform/repository.ts';

try {
  const config = loadConfig();
  const provider = createProvider(config.llm);
  const graphProvider = createGraphProvider(config.llm);
  const graph = startGraphRuntime(config.mongo, graphProvider, message => console.warn(message));
  const repository=createPlatformRepository(config.mongo);
  const app = await buildApp({
    config, provider, logger: true, graphService: graph.getService,repository,
    graphProviderConfigured: config.llm.provider !== 'fixture',
  }).catch(async error => { await graph.close();await repository.close(); throw error; });
  app.addHook('onClose', async () => graph.close());
  const close=async()=>{try{await app.close();}finally{await repository.close();}};
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      close().catch(error => { console.error(error); process.exitCode = 1; });
    });
  }
  try { await app.listen({ host: config.host, port: config.port }); }
  catch (error) { await close(); throw error; }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
