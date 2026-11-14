import type { GenerateArgs, ModelProvider } from './provider.ts';
// Explicitly injected test evidence; never presented as live extraction.
export class FixtureProvider implements ModelProvider {
  identity = 'fixture/v1';
  constructor(private output: unknown) {}
  async generateStructured<T>({ schema }: GenerateArgs<T>) {
    return { data: schema.parse(this.output), metadata: { provider: 'fixture', model: 'fixture-v1', latencyMs: 0 } };
  }
}
