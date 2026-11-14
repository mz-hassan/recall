import { createServer } from 'vite';
import { buildApp } from '../../../server/src/app.ts';
import { loadConfig } from '../../../server/src/config.ts';
import { createFixtureProvider } from '../../../server/src/llm/fixture.ts';

// Explicit fixture configuration: never read the developer's .env or use a paid provider.
const app = await buildApp({ config: loadConfig({}), provider: createFixtureProvider() });
await app.listen({ host: '127.0.0.1', port: 8791 });
const web = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true,
  proxy: { '/api': { target: 'http://127.0.0.1:8791', changeOrigin: false } } } });
await web.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await web.close(); await app.close(); process.exit(0);
});
