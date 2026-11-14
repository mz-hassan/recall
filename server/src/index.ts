import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createProvider } from './llm/index.ts';
import { DeepSeekProvider, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from './llm/deepseek.ts';
import { startGraphRuntime } from './features/graph/runtime.ts';

try {
  const config = loadConfig();
  const provider = createProvider(config.llm);
  const graphProvider = new DeepSeekProvider({
    key: config.llm.deepseekApiKey,
    model: config.llm.model ?? DEFAULT_DEEPSEEK_MODEL,
    baseUrl: config.llm.deepseekBaseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
  });
  const graph = startGraphRuntime(config.mongo, graphProvider, message => console.warn(message));
  const app = await buildApp({
    config, provider, logger: true, graphService: graph.getService,
    graphProviderConfigured: Boolean(config.llm.deepseekApiKey),
  }).catch(async error => { await graph.close(); throw error; });
  app.addHook('onClose', async () => graph.close());
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      app.close().catch(error => { console.error(error); process.exitCode = 1; });
    });
  }
  try { await app.listen({ host: config.host, port: config.port }); }
  catch (error) { await app.close(); throw error; }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
