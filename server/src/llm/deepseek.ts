import { createStructuredChatProvider, StructuredChatProvider, type EngineOptions } from './structuredChat.ts';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

export class DeepSeekProvider extends StructuredChatProvider {
  constructor(options: Omit<EngineOptions, 'vendor'>, request?: typeof fetch) {
    super({ ...options, vendor: 'deepseek' }, request);
  }
}

export function createDeepSeekProvider(options: Omit<Parameters<typeof createStructuredChatProvider>[1], 'model' | 'baseUrl'> & { model?: string; baseUrl?: string }) {
  return createStructuredChatProvider('deepseek', {
    ...options,
    model: options.model ?? DEFAULT_DEEPSEEK_MODEL,
    baseUrl: options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL,
  });
}
