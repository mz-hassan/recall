import { StructuredOutputError, type GenerateArgs, type ModelProvider, type ValidationFailure } from './provider.ts';
import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';

export class DeepSeekProvider implements ModelProvider {
  identity: string;
  constructor(private options: { key?: string; model: string; baseUrl: string }, private request: typeof fetch = fetch) {
    this.identity = `deepseek/${options.model}`;
  }
  async generateStructured<T>({ instructions, evidence, schema, signal }: GenerateArgs<T>) {
    if (!this.options.key) throw new Error('Add DEEPSEEK_API_KEY to .env and restart the API to enable graph indexing.');
    const started = Date.now();
    const validationFailures: ValidationFailure[] = [];
    const attemptUsage: unknown[] = [];
    let previousOutput: string | undefined;
    let correction: string | undefined;
    let invalidRelation = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(120000);
      let response: Response;
      try { response = await this.request(new URL('chat/completions', this.options.baseUrl.replace(/\/?$/, '/')), {
        method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Authorization: `Bearer ${this.options.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.options.model, max_tokens: 8000,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: instructions + '\nReturn JSON matching this schema: ' + JSON.stringify(z.toJSONSchema(schema)) },
            { role: 'user', content: JSON.stringify(evidence) },
            ...(correction ? [{ role: 'assistant', content: previousOutput }, { role: 'user', content: correction }] : [])],
        }),
      }); } catch (error) {
        signal?.throwIfAborted();
        if (attempt === 2) throw error;
        await delay(500 * 2 ** attempt, undefined, { signal });
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await delay(500 * 2 ** attempt, undefined, { signal });
        continue;
      }
      if (!response.ok) throw new Error(`DeepSeek request failed (${response.status}); check your key, model and account balance.`);
      const result = await response.json() as { choices?: { message: { content?: string }; finish_reason: string }[]; usage?: unknown };
      const choice = result.choices?.[0];
      attemptUsage.push(result.usage ?? null);
      const metadata = () => ({ provider: 'deepseek', model: this.options.model, latencyMs: Date.now() - started,
        usage: result.usage, attempts: attempt + 1, validationFailures, attemptUsage });
      if (!choice?.message.content?.trim() || choice.finish_reason === 'length') {
        throw new StructuredOutputError('DeepSeek returned empty or truncated output. Retry the update; the existing graph is unchanged.', metadata());
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
      if (attempt === 2) {
        throw new StructuredOutputError(invalidRelation
          ? 'DeepSeek returned an unsupported relationship type after 3 attempts. Retry the update; the existing graph is unchanged.'
          : 'DeepSeek returned invalid structured output after 3 attempts. Retry the update; the existing graph is unchanged.', metadata());
      }
      previousOutput = choice.message.content;
      correction = `Your previous response failed application validation:\n${issues.join('\n')}\nReturn the complete corrected JSON object using the SAME evidence and exact schema. Use only permitted enum values. If a relationship cannot be accurately expressed with an allowed type, omit that edge rather than inventing a type or changing its meaning. Preserve valid citations and concepts.`;
    }
    throw new Error('DeepSeek retries exhausted.');
  }
}
