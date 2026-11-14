import type { GenerateArgs, ModelProvider as GraphModelProvider } from './provider.ts';
// Explicitly injected test evidence; never presented as live extraction.
export class FixtureProvider implements GraphModelProvider {
  identity = 'fixture/v1';
  constructor(private output: unknown) {}
  async generateStructured<T>({ schema }: GenerateArgs<T>) {
    return { data: schema.parse(this.output), metadata: { provider: 'fixture', model: 'fixture-v1', latencyMs: 0 } };
  }
}

import { ProviderError, type GenerateStructuredRequest, type ModelProvider, type StructuredResult } from './types.ts';

/**
 * A fixture answers one task. It receives the full request so it can echo evidence IDs,
 * and returns raw output that is validated exactly like a real model's.
 */
export type Fixture = (request: GenerateStructuredRequest<unknown>) => unknown;

/**
 * Deterministic provider for local development and tests: no network, no API key.
 * Harnesses register fixtures for their own tasks; an unregistered task fails loudly.
 */
export function createFixtureProvider(fixtures: Record<string, Fixture> = {}): ModelProvider & {
  register(task: string, fixture: Fixture): void;
} {
  const registry = new Map(Object.entries(fixtures));
  return {
    name: 'fixture',
    model: 'fixture',
    modalities: ['text', 'image'],
    register(task, fixture) {
      registry.set(task, fixture);
    },
    async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
      const started = performance.now();
      if (request.signal?.aborted) throw new ProviderError('aborted', `Task ${request.task} was cancelled`);
      const fixture = registry.get(request.task);
      if (!fixture) throw new ProviderError('no_fixture', `No fixture registered for task ${request.task}`);
      const raw = fixture(request as GenerateStructuredRequest<unknown>);
      const parsed = request.schema.safeParse(raw);
      if (!parsed.success) {
        throw new ProviderError('invalid_output', `Fixture for ${request.task} failed validation: ${parsed.error.message}`);
      }
      return {
        data: parsed.data,
        provider: 'fixture',
        model: 'fixture',
        usage: { inputTokens: 0, outputTokens: 0 },
        latencyMs: performance.now() - started,
      };
    },
  };
}
