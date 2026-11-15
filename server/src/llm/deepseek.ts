import { StructuredOutputError, type GenerateArgs, type ModelProvider, type ValidationFailure } from './provider.ts';
import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { ProviderError, type Evidence, type GenerateStructuredRequest, type ModelProvider as LiveModelProvider } from './types.ts';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
type EngineOptions = { key?: string; model: string; baseUrl: string; attempts?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; formatEvidence?: (evidence: unknown) => string };
const ChatResponse = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).loose().optional(),
});

export class DeepSeekProvider implements ModelProvider {
  identity: string;
  constructor(private options: EngineOptions, private request: typeof fetch = fetch) {
    this.identity = `deepseek/${options.model}`;
  }
  async generateStructured<T>({ instructions, evidence, schema, signal, options: hints }: GenerateArgs<T>) {
    if (!this.options.key) throw new Error('Add DEEPSEEK_API_KEY to .env and restart the API to enable graph indexing.');
    const started = Date.now();
    const maxAttempts = this.options.attempts ?? 3;
    const pause = (ms: number) => this.options.sleep ? this.options.sleep(ms) : delay(ms, undefined, { signal });
    const reasoning = hints?.reasoning ?? 'off';
    const answerBudget = hints?.maxOutputTokens ?? 8000;
    const validationFailures: ValidationFailure[] = [];
    const attemptUsage: unknown[] = [];
    let previousOutput: string | undefined;
    let correction: string | undefined;
    let invalidRelation = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 120000);
      let response: Response;
      try { response = await this.request(new URL('chat/completions', this.options.baseUrl.replace(/\/?$/, '/')), {
        method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Authorization: `Bearer ${this.options.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.options.model, max_tokens: reasoning === 'off' ? answerBudget : answerBudget + 6144,
          thinking: { type: reasoning === 'off' ? 'disabled' : 'enabled' },
          ...(reasoning !== 'off' ? { reasoning_effort: reasoning } : {}),
          ...(hints?.temperature !== undefined ? { temperature: hints.temperature } : {}),
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: instructions + '\nReturn JSON matching this schema: ' + JSON.stringify(z.toJSONSchema(schema)) },
            { role: 'user', content: this.options.formatEvidence ? this.options.formatEvidence(evidence) : JSON.stringify(evidence) },
            ...(correction ? [...(previousOutput ? [{ role: 'assistant', content: previousOutput }] : []), { role: 'user', content: correction }] : [])],
        }),
      }); } catch (error) {
        signal?.throwIfAborted();
        if (attempt === maxAttempts - 1) throw error;
        await pause(500 * 2 ** attempt);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts - 1) {
        await response.body?.cancel();
        await pause(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`DeepSeek request failed (${response.status}); check your key, model and account balance.`);
      const parsedResponse = ChatResponse.safeParse(await response.json().catch(() => null));
      if (!parsedResponse.success) {
        if (attempt === maxAttempts - 1) throw new Error('DeepSeek returned an unexpected response shape. Retry the update.');
        await pause(500 * 2 ** attempt);
        continue;
      }
      const result = parsedResponse.data;
      const choice = result.choices?.[0];
      attemptUsage.push(result.usage ?? null);
      const metadata = () => ({ provider: 'deepseek', model: result.model ?? this.options.model, latencyMs: Date.now() - started,
        usage: result.usage, attempts: attempt + 1, validationFailures, attemptUsage });
      if (!choice?.message.content?.trim() || choice.finish_reason === 'length') {
        validationFailures.push({ attempt: attempt + 1, issues: ['Return a complete, nonblank JSON object matching the schema.'] });
        if (attempt === maxAttempts - 1) throw new StructuredOutputError('DeepSeek returned empty or truncated output. Retry the update; the existing graph is unchanged.', metadata());
        previousOutput = undefined;
        correction = 'Your previous answer was blank or truncated. Return the complete JSON object matching the supplied schema and evidence.';
        continue;
      }
      let issues: string[] | undefined;
      invalidRelation = false;
      let parsed: unknown;
      try { parsed = JSON.parse(choice.message.content); }
      catch { issues = ['response: return a valid JSON object without Markdown or extra text.']; }
      if (!issues) {
        const validated = schema.safeParse(parsed);
        if (validated.success) return { data: validated.data, metadata: metadata() };
        invalidRelation = validated.error.issues.some(issue => issue.code === 'invalid_value' && issue.path.at(-1) === 'relation');
        issues = validated.error.issues.slice(0, 12).map(issue => `${issue.path.join('.') || 'response'}: ${issue.message}`);
      }
      validationFailures.push({ attempt: attempt + 1, issues });
      if (attempt === maxAttempts - 1) {
        throw new StructuredOutputError(invalidRelation
          ? `DeepSeek returned an unsupported relationship type after ${maxAttempts} attempts. Retry the update; the existing graph is unchanged.`
          : `DeepSeek returned invalid structured output after ${maxAttempts} attempts. Retry the update; the existing graph is unchanged.`, metadata());
      }
      previousOutput = choice.message.content;
      correction = `Your previous response failed application validation:\n${issues.join('\n')}\nReturn the complete corrected JSON object using the SAME evidence and exact schema. Use only permitted enum values. If a relationship cannot be accurately expressed with an allowed type, omit that edge rather than inventing a type or changing its meaning. Preserve valid citations and concepts.`;
    }
    throw new Error('DeepSeek retries exhausted.');
  }
}

type DeepSeekOptions = {
  apiKey: string; model?: string; baseUrl?: string;
  timeoutMs?: number; attempts?: number; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>;
};

function formatEvidence(evidence: Evidence[]): string {
  return Buffer.from(evidence.map(item => {
    if (item.kind !== 'text') throw new ProviderError('unsupported_modality', 'The DeepSeek adapter sends text only');
    return `<evidence id="${item.id}">\n${item.text}\n</evidence>`;
  }).join('\n\n'), 'utf8').toString('utf8'); // Repair lone UTF-16 surrogates from PDF extracts before JSON encoding.
}

/** Live lecture facade over the same validated/retrying transport used by graph extraction. */
export function createDeepSeekProvider({
  apiKey, model = DEFAULT_DEEPSEEK_MODEL, baseUrl = DEFAULT_DEEPSEEK_BASE_URL,
  timeoutMs = 45000, attempts = 2, fetch: fetchImpl = fetch, sleep,
}: DeepSeekOptions): LiveModelProvider {
  const engine = new DeepSeekProvider({
    key: apiKey, model, baseUrl, timeoutMs, attempts, sleep,
    formatEvidence: evidence => formatEvidence(evidence as Evidence[]),
  }, (url, init) => fetchImpl(String(url), { ...init, headers: Object.fromEntries(new Headers(init?.headers).entries()) }));
  return {
    name: 'deepseek', model, modalities: ['text'],
    async generateStructured<T>(request: GenerateStructuredRequest<T>) {
      if (request.signal?.aborted) throw new ProviderError('aborted', `Task ${request.task} was cancelled`);
      formatEvidence(request.evidence); // Reject unsupported modalities before sending a request.
      try {
        const result = await engine.generateStructured({
          ...request,
          options: { ...request.options, reasoning: request.options?.reasoning ?? 'high', maxOutputTokens: request.options?.maxOutputTokens ?? 2048 },
        });
        const usage = result.metadata.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        return { data: result.data, provider: 'deepseek', model: result.metadata.model,
          usage: { inputTokens: usage?.prompt_tokens ?? 0, outputTokens: usage?.completion_tokens ?? 0 },
          latencyMs: result.metadata.latencyMs };
      } catch (error) {
        if (request.signal?.aborted) throw new ProviderError('aborted', `Task ${request.task} was cancelled`);
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(error instanceof StructuredOutputError ? 'invalid_output' : 'request_failed',
          error instanceof Error ? error.message : 'DeepSeek request failed', error);
      }
    },
  };
}
