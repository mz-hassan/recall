import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createProvider } from './llm/index.ts';

const config = loadConfig();
const provider = createProvider(config.llm);
const app = await buildApp({ config, provider, logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ host: config.host, port: config.port });
