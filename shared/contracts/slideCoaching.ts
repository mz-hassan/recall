import { z } from 'zod';

const Text = z.string().trim().min(1);
export const CoachingSpec = z.object({
  mode: z.enum(['highlight', 'whole']),
  note: Text.max(300),
  highlights: z.array(z.object({ textId: Text.max(12), note: Text.max(160) }).strict()).max(10),
  steps: z.array(z.object({ note: Text.max(180), textIds: z.array(Text.max(12)).max(10) }).strict()).max(6),
  table: z.object({ title: Text.max(100), columns: z.array(Text.max(70)).min(1).max(4),
    rows: z.array(z.array(Text.max(160)).min(1).max(4)).min(1).max(6),
    basis: z.enum(['evidence', 'illustrative']),
  }).strict().nullable(),
  equations: z.array(z.object({ expression: Text.max(500), explanation: Text.max(240),
    variables: z.array(z.object({ symbol: Text.max(40), definition: Text.max(180) }).strict()).max(10),
  }).strict()).max(3),
}).strict().refine(spec => !spec.table || spec.table.rows.every(row => row.length === spec.table!.columns.length), 'Table rows must match columns');
export type CoachingSpec = z.infer<typeof CoachingSpec>;
export const SlideCoaching = z.object({ runId: Text, momentId: Text, revision: z.number().int().positive(),
  page: z.number().int().positive(), fingerprint: Text, spec: CoachingSpec, provider: Text, model: Text,
  runs: z.array(z.object({ id: Text, text: z.string(), rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }) })),
  readings: z.array(z.object({ title: Text, url: z.url(), excerpt: Text.max(1200) })).max(2),
});
export type SlideCoaching = z.infer<typeof SlideCoaching>;
