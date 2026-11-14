import { z } from 'zod';

// Server-only settings. Never import this file from browser code: it can hold API keys.
const ConfigSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LLM_PROVIDER: z.enum(['fixture', 'deepseek', 'gemini']).default('fixture'),
  LLM_MODEL: z.string().optional(),
  DEEPSEEK_BASE_URL: z.url().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.LLM_PROVIDER === 'deepseek' && !value.DEEPSEEK_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['DEEPSEEK_API_KEY'], message: 'Required when LLM_PROVIDER=deepseek' });
  }
  if (value.LLM_PROVIDER === 'gemini' && !value.GEMINI_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'Required when LLM_PROVIDER=gemini' });
  }
});

export type Config = {
  host: string;
  port: number;
  llm: {
    provider: 'fixture' | 'deepseek' | 'gemini';
    model: string | undefined;
    deepseekBaseUrl: string | undefined;
    deepseekApiKey: string | undefined;
    geminiApiKey: string | undefined;
  };
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Treat blank values from .env.example the same as unset ones.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = ConfigSchema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error('Invalid server configuration: ' + problems);
  }
  const value = parsed.data;
  return {
    host: value.HOST,
    port: value.PORT,
    llm: {
      provider: value.LLM_PROVIDER,
      model: value.LLM_MODEL,
      deepseekBaseUrl: value.DEEPSEEK_BASE_URL,
      deepseekApiKey: value.DEEPSEEK_API_KEY,
      geminiApiKey: value.GEMINI_API_KEY,
    },
  };
}
