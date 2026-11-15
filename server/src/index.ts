import { readFile } from 'node:fs/promises';
import { serveFrontend } from './platform/static.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createGraphProvider, createProvider } from './llm/index.ts';
import { startGraphRuntime } from './features/graph/runtime.ts';
import { createPlatformRepository } from './platform/repository.ts';

try {
  const config = loadConfig();
  const provider = createProvider(config.llm);
  const { certFile, keyFile } = config.deployment;
  const tls = certFile && keyFile ? { cert: await readFile(certFile), key: await readFile(keyFile) } : undefined;
  const serveWeb = process.argv.includes('--serve-web');
  const graphProvider = createGraphProvider(config.llm);
  const graph = startGraphRuntime(config.mongo, graphProvider, message => console.warn(message));
  const repository=createPlatformRepository(config.mongo);
  const app = await buildApp({
    config, provider, tls, logger: true, graphService: graph.getService,repository,
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
  try {
    if (serveWeb) {
      await serveFrontend(app, 'dist', repository);
      await repository.connect();
    }
    await app.listen({ host: config.host, port: config.port });
  }
  catch (error) { await close(); throw error; }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
