import { z } from 'zod';

const id = z.string().min(1).max(100);
export const Kind = z.enum(['claim', 'definition', 'algorithm']);
export const Rect = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
export const SourceAnchor = z.object({ id, page: z.number().int().positive(), quote: z.string(), rects: z.array(Rect) });
export const PaperRef = z.object({ id, courseId: id, title: z.string(), originalUrl: z.string().url().optional(), pdfUrl: z.string().nullable(), assignments: z.array(z.object({ lectureId: id, kind: z.enum(['required', 'optional']) })) });
const CitedSummary = z.object({ title: z.string(), text: z.string(), citation: id });
export const ReadingBundle = z.object({
  version: z.literal(1), paperId: id, fingerprint: z.string(), pageCount: z.number().int().positive(),
  title: z.string(), subtitle: z.string(), authors: z.string(), year: z.string(), overview: z.string(),
  pageSizes: z.array(z.object({ width: z.number().positive(), height: z.number().positive() })),
  ideas: z.array(CitedSummary), findings: z.array(CitedSummary), limitations: z.array(CitedSummary), guidance: z.array(z.string()),
  sections: z.array(z.object({ id, title: z.string(), page: z.number().int().positive(), y: z.number().min(0).max(1), summary: z.string(), topics: z.array(id) })),
  passages: z.array(SourceAnchor), highlights: z.array(SourceAnchor.extend({ kind: Kind, title: z.string(), explanation: z.string(), sectionId: id })),
});
export const TeacherRequest = z.object({
  requestId: id, question: z.string().trim().min(1).max(3000),
  context: z.object({ page: z.number().int().positive().max(1000), endPage: z.number().int().positive().max(1000).optional(), passageId: id.optional(), quote: z.string().max(6000).optional() }).nullable(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6000) })).max(12).default([]),
});
export const Annotation = z.object({ passageId: id, kind: Kind, explanation: z.string().min(1).max(1200) });
export const Diagram = z.object({ title: z.string().max(150), description: z.string().max(1000), nodes: z.array(z.object({ id, label: z.string().max(180), passageId: id })).min(1).max(8), edges: z.array(z.object({ from: id, to: id, label: z.string().max(100) })).max(12) });
export const Answer = z.object({ blocks: z.array(z.object({ text: z.string().min(1).max(6000), citations: z.array(id).min(1).max(12) })).min(1).max(8) });
export const TeacherResponse = Answer.extend({ requestId: id, annotations: z.array(Annotation).max(8), diagrams: z.array(Diagram).max(2), provider: z.string(), model: z.string() });
export type TeacherInput = z.infer<typeof TeacherRequest>;
export type TeacherOutput = z.infer<typeof TeacherResponse>;
