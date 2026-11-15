import { createStructuredChatProvider, StructuredChatProvider } from './structuredChat.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/';

export function createGeminiProviders(apiKey: string, model = DEFAULT_GEMINI_MODEL) {
  return {
    live: createStructuredChatProvider('gemini', { apiKey, model, baseUrl: GEMINI_BASE_URL }),
    graph: new StructuredChatProvider({ vendor: 'gemini', key: apiKey, model, baseUrl: GEMINI_BASE_URL }),
  };
}
