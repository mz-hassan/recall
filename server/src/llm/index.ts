import type { Config } from '../config.ts';
import { createDeepSeekProvider, DeepSeekProvider, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from './deepseek.ts';
import { createFixtureProvider } from './fixture.ts';
import { createGeminiProviders } from './gemini.ts';
import type { ModelProvider } from './types.ts';

export * from './types.ts';
export { createFixtureProvider } from './fixture.ts';
export { createDeepSeekProvider } from './deepseek.ts';

/** Picks the configured adapter. Swapping providers changes config, not feature code. */
export function createProvider(config: Config['llm']): ModelProvider {
  switch (config.provider) {
    case 'fixture':
      return createFixtureProvider();
    case 'deepseek':
      return createDeepSeekProvider({
        apiKey: config.deepseekApiKey!, // loadConfig guarantees it when the provider is deepseek
        model: config.model ?? DEFAULT_DEEPSEEK_MODEL,
        ...(config.deepseekBaseUrl && { baseUrl: config.deepseekBaseUrl }),
      });
    case 'gemini':
      return createGeminiProviders(config.geminiApiKey!, config.model).live;
  }
}

export function createGraphProvider(config: Config['llm']) {
  if (config.provider === 'gemini') return createGeminiProviders(config.geminiApiKey!, config.model).graph;
  if (config.provider === 'fixture') return {
    identity: 'fixture',
    async generateStructured(): Promise<never> {
      throw new Error('Select Gemini or DeepSeek in .env to generate a knowledge graph.');
    },
  };
  return new DeepSeekProvider({
    key: config.deepseekApiKey,
    model: config.model ?? DEFAULT_DEEPSEEK_MODEL,
    baseUrl: config.deepseekBaseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
  });
}
