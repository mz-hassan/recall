import { z } from 'zod';

export const ENRICHMENT_TASK = 'lecture.enrichment';

/** Moment types the timeline shows as an eyebrow label. */
export const MOMENT_TYPES = [
  'FOUNDATION', 'CONCEPT', 'KEY CONCEPT', 'KEY INSIGHT', 'THEORY', 'ALGORITHM', 'EXAMPLE', 'BIG PICTURE', 'DISCUSSION', 'LOGISTICS',
] as const;

const upper = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase() : value;

/** What the enrichment model must return for one finished topic. Developer-owned; validated on every answer. */
export const EnrichmentResult = z.object({
  summary: z.string().trim().min(1).max(700),
  intuition: z.string().trim().max(600),
  type: z.preprocess(upper, z.enum(MOMENT_TYPES)),
  equations: z.array(z.object({
    expression: z.string().trim().min(1).max(200),
    explanation: z.string().trim().min(1).max(400),
  })).max(3),
  slides: z.array(z.object({
    page: z.number().int().positive(),
    confidence: z.preprocess(value => typeof value === 'string' ? value.trim().toLowerCase() : value, z.enum(['high', 'low'])),
  })).max(3),
  diagram: z.object({
    nodes: z.array(z.object({ id: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(60) })).min(2).max(5),
    edges: z.array(z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
      relation: z.string().trim().min(1).max(40),
    })).min(1).max(6),
  }).nullable(),
  lecture_so_far: z.string().trim().min(1).max(1500),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResult>;
