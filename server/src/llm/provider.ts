import type { z } from 'zod';
export type ValidationFailure = { attempt: number; issues: string[] };
export type GenerationMetadata = { provider: string; model: string; latencyMs: number; usage?: unknown; attempts?: number; validationFailures?: ValidationFailure[]; attemptUsage?: unknown[] };
export class StructuredOutputError extends Error {
  constructor(message: string, readonly metadata: GenerationMetadata) { super(message); this.name = 'StructuredOutputError'; }
}
export type GenerateArgs<T> = { task: string; instructions: string; evidence: unknown; schema: z.ZodType<T>; signal?: AbortSignal;
  options?: { temperature?: number; maxOutputTokens?: number; reasoning?: 'off' | 'low' | 'high' };
};
export interface ModelProvider {
  identity: string;
  generateStructured<T>(args: GenerateArgs<T>): Promise<{ data: T; metadata: GenerationMetadata }>;
}
