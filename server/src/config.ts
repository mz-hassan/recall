import { z } from 'zod';

const schema = z.object({
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().default('recall'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LLM_PROVIDER: z.literal('deepseek').default('deepseek'),
  LLM_MODEL: z.string().default('deepseek-flash'),
  DEEPSEEK_BASE_URL: z.url().default('https://api.deepseek.com'),
  DEEPSEEK_API_KEY: z.string().optional().transform(value => value?.trim() || undefined),
});
export const config = schema.parse(process.env);
