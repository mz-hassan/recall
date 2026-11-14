import type { Config } from '../config.ts';
import { createFixtureProvider } from './fixture.ts';
import { ProviderError, type ModelProvider } from './types.ts';

export * from './types.ts';
export { createFixtureProvider } from './fixture.ts';

/** Picks the configured adapter. Swapping providers changes config, not feature code. */
export function createProvider(config: Config['llm']): ModelProvider {
  switch (config.provider) {
    case 'fixture':
      return createFixtureProvider();
    case 'deepseek':
      // Added in D3 (segmentation), when the first real model call is needed.
      throw new ProviderError('not_implemented', 'The DeepSeek adapter is not implemented yet. Use LLM_PROVIDER=fixture.');
    case 'gemini':
      throw new ProviderError('not_implemented', 'The Gemini adapter is not implemented yet. Use LLM_PROVIDER=fixture.');
  }
}
