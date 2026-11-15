import type { z } from 'zod';

// The one operation every feature harness uses to call a model.
// Features never import a vendor SDK; adapters in this folder do.

/** A piece of source material the model may use, with an ID so answers can cite it. */
export type Evidence =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; mimeType: string; data: string };

export type Modality = Evidence['kind'];

export type GenerateStructuredRequest<T> = {
  /** Stable task name, e.g. 'lecture.segmentation'. Used for logging and fixtures. */
  task: string;
  /** Versioned instructions owned by the calling harness. */
  instructions: string;
  evidence: Evidence[];
  /** Application schema. Every result is validated against it before it is returned. */
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  /** Optional generation hints; adapters ignore what their model does not support. */
  options?: {
    temperature?: number;
    /** Budget for the visible answer. Adapters add headroom when the model reasons first. */
    maxOutputTokens?: number;
    /** How much the model may think before answering. Fast, frequent tasks should use 'off'. */
    reasoning?: 'off' | 'low' | 'high';
  };
};

export type Usage = { inputTokens: number; outputTokens: number };

export type StructuredResult<T> = {
  data: T;
  provider: string;
  model: string;
  usage: Usage;
  latencyMs: number;
};

export interface ModelProvider {
  readonly name: string;
  readonly model: string;
  /** What kinds of evidence this adapter can actually send to its model. */
  readonly modalities: readonly Modality[];
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** Thrown when a provider cannot produce a valid result. Harnesses keep the previous result or raw text. */
export class ProviderError extends Error {
  readonly code: 'unsupported_modality' | 'invalid_output' | 'no_fixture' | 'not_implemented' | 'aborted' | 'request_failed';
  constructor(code: ProviderError['code'], message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ProviderError';
    this.code = code;
  }
}
