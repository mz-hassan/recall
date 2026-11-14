import { z } from 'zod';

export const citationSchema = z.object({
  sourceId: z.string().min(1), quote: z.string().min(8).max(1200),
});
export const extractionSchema = z.object({
  concepts: z.array(z.object({
    key: z.string().min(1).max(120), label: z.string().min(1).max(160),
    aliases: z.array(z.string().min(1).max(160)).max(12),
    summary: z.string().trim().min(40).max(1000).optional(),
    citations: z.array(citationSchema).min(1).max(8),
  })).max(60),
  edges: z.array(z.object({
    from: z.string(), to: z.string(),
    relation: z.enum(['is_a', 'uses', 'extends', 'contrasts_with', 'addresses', 'depends_on']),
    citations: z.array(citationSchema).min(1).max(8),
  })).max(120),
});
export const sourceInputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(160),
  title: z.string().min(1).max(300),
  text: z.string().min(1).max(2_000_000),
  url: z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)).optional(),
  path: z.string().optional(),
  page: z.number().int().positive().optional(),
});
export const completionSchema = z.object({
  courseId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),
  lectureId: z.string().regex(/^\d+$/).max(10),
  revision: z.number().int().positive(),
}).strict();
export type Completion = z.infer<typeof completionSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type Source = z.infer<typeof sourceInputSchema> & { hash: string };
export type Lecture = { courseId: string; id: string; title: string; sources: Source[]; contentHash: string };
export type Reference = { sourceId: string; sourceHash: string; lectureId: string; quote: string; start: number; end: number; title: string; url?: string; path?: string; page?: number };
export type Concept = { id: string; label: string; aliases: string[]; summary?: string; lectureIds: string[]; references: Reference[] };
export type Edge = { id: string; from: string; to: string; relation: string; lectureIds: string[]; references: Reference[] };
export type IndexedLecture = { lectureId: string; title: string; extractions: Extraction[]; sources: Source[]; metadata: unknown[] };
export type IndexedRevision = { id: string; title: string; revision: number; contentHash: string; pipeline: string; indexedAt: string };
export type Graph = { nodes: Concept[]; edges: Edge[]; lectures: IndexedRevision[]; version: string; updatedAt: string | null; changes: { nodes: string[]; edges: string[]; lectureId?: string } };
export type Job = Completion & { id: string; contentHash: string; pipeline: string; title: string; state: 'queued' | 'running' | 'completed' | 'failed'; progress: number; total: number; error?: string; updatedAt: string; metadata?: unknown[] };
export const emptyGraph = (): Graph => ({ nodes: [], edges: [], lectures: [], version: '', updatedAt: null, changes: { nodes: [], edges: [] } });
