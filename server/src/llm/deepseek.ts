import { z } from 'zod';
import { ProviderError, type Evidence, type GenerateStructuredRequest, type ModelProvider, type StructuredResult } from './types.ts';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

type DeepSeekOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Total attempts for transient failures (network, 429, 5xx, blank or invalid JSON). */
  attempts?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const ChatResponse = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

function formatEvidence(evidence: Evidence[]): string {
  return evidence.map(item => {
    if (item.kind !== 'text') throw new ProviderError('unsupported_modality', 'The DeepSeek adapter sends text only');
    return `<evidence id="${item.id}">\n${item.text}\n</evidence>`;
  }).join('\n\n');
}

class RetryableError extends Error {}

/**
 * DeepSeek through its OpenAI-compatible chat API, in JSON mode. JSON mode guarantees JSON but not
 * our shape, so every answer is validated against the caller's schema and retried once if it fails.
 * Text only: image evidence is refused rather than silently dropped.
 */
export function createDeepSeekProvider({
  apiKey, model = DEFAULT_DEEPSEEK_MODEL, baseUrl = DEFAULT_DEEPSEEK_BASE_URL, timeoutMs = 45_000, attempts = 2,
  fetch: fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}: DeepSeekOptions): ModelProvider {
  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  async function attempt<T>(request: GenerateStructuredRequest<T>, body: string): Promise<{ data: T; usage: StructuredResult<T>['usage']; model: string }> {
    const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body,
        signal,
      });
    } catch (error) {
      if (request.signal?.aborted) throw new ProviderError('aborted', `Task ${request.task} was cancelled`);
      throw new RetryableError('DeepSeek request failed: ' + (error instanceof Error ? error.name : 'network error'));
    }
    if (response.status === 429 || response.status >= 500) throw new RetryableError(`DeepSeek returned ${response.status}`);
    if (!response.ok) {
      // 4xx (bad key, bad request) will not succeed on retry. Never echo the request: it holds the key.
      const detail = await response.text().catch(() => '');
      throw new ProviderError('request_failed', `DeepSeek returned ${response.status}: ${detail.replace(/sk-\S+/g, '[redacted]').slice(0, 300)}`);
    }
    const parsedResponse = ChatResponse.safeParse(await response.json().catch(() => null));
    if (!parsedResponse.success) throw new RetryableError('DeepSeek returned an unexpected response shape');
    const choice = parsedResponse.data.choices[0]!;
    const content = choice.message.content?.trim();
    if (!content) throw new RetryableError(`DeepSeek returned blank content (finish_reason: ${choice.finish_reason ?? 'unknown'})`);
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      throw new RetryableError('DeepSeek returned content that is not JSON');
    }
    const result = request.schema.safeParse(json);
    if (!result.success) throw new RetryableError('DeepSeek output failed validation: ' + z.prettifyError(result.error));
    return {
      data: result.data,
      model: parsedResponse.data.model ?? model,
      usage: {
        inputTokens: parsedResponse.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsedResponse.data.usage?.completion_tokens ?? 0,
      },
    };
  }

  return {
    name: 'deepseek',
    model,
    modalities: ['text'],
    async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
      const started = performance.now();
      const schema = JSON.stringify(z.toJSONSchema(request.schema, { io: 'output', unrepresentable: 'any' }));
      // deepseek-flash thinks by default, and its reasoning tokens share max_tokens with the answer:
      // too small a budget truncates the JSON, which DeepSeek then returns as blank content.
      const reasoning = request.options?.reasoning;
      const answerBudget = request.options?.maxOutputTokens ?? 2048;
      const thinking = reasoning === 'off'
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, ...(reasoning && { reasoning_effort: reasoning }) };
      const body = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `${request.instructions}\n\nRespond with a single json object that matches this JSON Schema:\n${schema}` },
          { role: 'user', content: formatEvidence(request.evidence) },
        ],
        response_format: { type: 'json_object' },
        stream: false,
        ...thinking,
        ...(request.options?.temperature !== undefined && { temperature: request.options.temperature }),
        max_tokens: reasoning === 'off' ? answerBudget : answerBudget + 6144,
      });
      let lastError: unknown;
      for (let index = 0; index < attempts; index += 1) {
        if (request.signal?.aborted) throw new ProviderError('aborted', `Task ${request.task} was cancelled`);
        try {
          const { data, usage, model: served } = await attempt(request, body);
          return { data, usage, provider: 'deepseek', model: served, latencyMs: performance.now() - started };
        } catch (error) {
          if (!(error instanceof RetryableError)) throw error;
          lastError = error;
          if (index < attempts - 1) await sleep(500 * (index + 1));
        }
      }
      const message = lastError instanceof Error ? lastError.message : 'unknown failure';
      throw new ProviderError(/validation|JSON|blank/.test(message) ? 'invalid_output' : 'request_failed', `${request.task}: ${message}`);
    },
  };
}
