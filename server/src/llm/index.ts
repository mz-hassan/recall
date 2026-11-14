import type { Config } from '../config.ts';
import { createDeepSeekProvider, DEFAULT_DEEPSEEK_MODEL } from './deepseek.ts';
import { createFixtureProvider } from './fixture.ts';
import { ProviderError, type ModelProvider } from './types.ts';

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
      throw new ProviderError('not_implemented', 'The Gemini adapter is not implemented yet. Use LLM_PROVIDER=fixture or deepseek.');
  }
}
