import { z } from 'zod';

// Server-only configuration. Never import this module into browser code.
const ConfigSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  // The API's own port. Named API_PORT, not PORT, so the Vite proxy reads the same unambiguous value.
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_ORIGIN: z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  }, 'Use an HTTP(S) origin without a path or trailing slash').optional(),
  TLS_CERT_FILE: z.string().optional(),
  TLS_KEY_FILE: z.string().optional(),
  TRUST_LOOPBACK_PROXY: z.enum(['0', '1']).default('0'),
  STAFF_INVITE_CODE: z.string().max(256).optional(),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().default('recall'),
  LLM_PROVIDER: z.enum(['fixture', 'deepseek', 'gemini']).default('fixture'),
  LLM_MODEL: z.string().optional(),
  DEEPSEEK_BASE_URL: z.url().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.TLS_CERT_FILE) !== Boolean(value.TLS_KEY_FILE)) {
    ctx.addIssue({ code: 'custom', path: ['TLS_CERT_FILE'], message: 'Set both TLS_CERT_FILE and TLS_KEY_FILE' });
  }
  if (value.TRUST_LOOPBACK_PROXY === '1' && !['127.0.0.1','::1','localhost'].includes(value.HOST)) {
    ctx.addIssue({ code: 'custom', path: ['HOST'], message: 'Bind to loopback when trusting a loopback proxy' });
  }
  if (value.TLS_CERT_FILE && !value.APP_ORIGIN?.startsWith('https://')) {
    ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'Set an HTTPS origin for native TLS' });
  }
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
  deployment: { origin?: string; certFile?: string; keyFile?: string; trustLoopbackProxy: boolean; staffInvite?: string };
  mongo: { uri: string; database: string };
  llm: {
    provider: 'fixture' | 'deepseek' | 'gemini';
    model: string | undefined;
    deepseekBaseUrl: string | undefined;
    deepseekApiKey: string | undefined;
    geminiApiKey: string | undefined;
  };
};
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const present = Object.fromEntries(Object.entries(env)
    .filter(([, value]) => value !== undefined && value.trim() !== '')
    .map(([key, value]) => [key, value!.trim()]));
  const parsed = ConfigSchema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error('Invalid server configuration: ' + problems);
  }
  const value = parsed.data;
  return {
    host: value.HOST, port: value.API_PORT,
    deployment: { origin: value.APP_ORIGIN, certFile: value.TLS_CERT_FILE, keyFile: value.TLS_KEY_FILE,
      trustLoopbackProxy: value.TRUST_LOOPBACK_PROXY === '1', staffInvite: value.STAFF_INVITE_CODE },
    mongo: { uri: value.MONGODB_URI, database: value.MONGODB_DB },
    llm: {
      provider: value.LLM_PROVIDER, model: value.LLM_MODEL,
      deepseekBaseUrl: value.DEEPSEEK_BASE_URL, deepseekApiKey: value.DEEPSEEK_API_KEY,
      geminiApiKey: value.GEMINI_API_KEY,
    },
  };
}
