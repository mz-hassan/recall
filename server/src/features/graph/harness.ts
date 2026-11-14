import { extractionSchema, type Extraction, type Lecture } from '../../../../shared/contracts/graph.ts';
import type { ModelProvider } from '../../llm/provider.ts';
import { instructions, promptVersion } from './prompts/extract.ts';
import { z } from 'zod';

const spanCitation = z.object({ sourceId: z.string(), spanId: z.string() });
const modelSchema = z.object({
  concepts: z.array(extractionSchema.shape.concepts.element.omit({ citations: true }).extend({ citations: z.array(spanCitation).min(1).max(8) })).max(60),
  edges: z.array(extractionSchema.shape.edges.element.omit({ citations: true }).extend({ citations: z.array(spanCitation).min(1).max(8) })).max(120),
});
export type SegmentResult = { extraction: Extraction; metadata: unknown[] };
export type Checkpoints = { load(key: string): Promise<SegmentResult | null>; save(key: string, value: SegmentResult): Promise<void> };

function resolveEndpoints(extraction: Extraction, known: { key: string; label: string; aliases: string[] }[]) {
  const data = structuredClone(extraction);
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const edge of data.edges) {
    for (const field of ['from', 'to'] as const) {
      const key = edge[field];
      if (data.concepts.some(node => node.key === key)) continue;
      const matches = data.concepts.filter(node => [node.key, node.label, ...node.aliases].some(value => normalize(value) === normalize(key)));
      if (matches.length === 1) { edge[field] = matches[0].key; continue; }
      const existing = known.filter(node => [node.key, node.label, ...node.aliases].some(value => normalize(value) === normalize(key)));
      if (existing.length === 1) {
        // Existing concepts may be referenced without being redefined by the model.
        // The cited relationship supplies fresh evidence for its endpoints.
        const node = existing[0];
        data.concepts.push({ ...node, citations: edge.citations }); edge[field] = node.key;
      }
    }
  }
  data.edges = data.edges.filter(edge => edge.from !== edge.to);
  return data;
}
export function evidenceSpans(text: string) {
  const spans: { id: string; quote: string }[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 800, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '), window.lastIndexOf('\n'));
      if (boundary > 100) end = start + boundary + 1;
    }
    const quote = text.slice(start, end).trim();
    if (quote.length >= 8) spans.push({ id: `s${spans.length}`, quote });
    start = end;
  }
  return spans;
}

export { promptVersion };
export function validateEvidence(extraction: Extraction, sources: { id: string; text: string }[]) {
  const keys = new Set(extraction.concepts.map(node => node.key));
  if (keys.size !== extraction.concepts.length) throw new Error('Duplicate concept keys in model response.');
  for (const item of [...extraction.concepts, ...extraction.edges]) {
    for (const ref of item.citations) {
      if (!sources.some(source => source.id === ref.sourceId && source.text.includes(ref.quote))) {
        throw new Error('Graph citation does not match supplied source evidence.');
      }
    }
  }
  for (const edge of extraction.edges) {
    if (!keys.has(edge.from) || !keys.has(edge.to) || edge.from === edge.to) throw new Error(`Unresolvable graph edge: ${edge.from} -> ${edge.to}. Include both endpoints as concepts using their exact keys.`);
  }
  return extraction;
}
export async function extractLecture(lecture: Lecture, provider: ModelProvider, known: { key: string; label: string; aliases: string[] }[], signal?: AbortSignal, onProgress?: (progress: number, total: number) => Promise<void>, checkpoints?: Checkpoints) {
  const extractions: Extraction[] = [];
  const metadata: unknown[] = [];
  const total = lecture.sources.reduce((sum, source) => sum + Math.ceil(source.text.length / 11500), 0);
  let progress = 0;
  await onProgress?.(progress, total);
  for (const source of lecture.sources) {
    for (let offset = 0; offset < source.text.length; offset += 11500) {
      signal?.throwIfAborted();
      const text = source.text.slice(offset, offset + 12000);
      const segment = { id: source.id, text, spans: evidenceSpans(text) };
      const checkpointKey = `${source.id}/${source.hash}/${offset}`;
      const cached = await checkpoints?.load(checkpointKey);
      let validated: Extraction | undefined = cached?.extraction;
      const segmentMetadata: unknown[] = cached?.metadata ?? [];
      let validationError: string | undefined;
      for (let attempt = 0; !validated && attempt < 2; attempt++) {
        const result = await provider.generateStructured({ task: 'graph.extract', instructions,
          evidence: { lecture: lecture.title, source: segment, existingConcepts: known, ...(validationError ? { validationError } : {}) }, schema: modelSchema, signal });
        try {
          const citations = (items: z.infer<typeof spanCitation>[]) => items.map(ref => {
            const span = segment.spans.find(span => span.id === ref.spanId);
            if (!span || ref.sourceId !== source.id) throw new Error('Graph citation refers to an unavailable source or evidence span. Use only the supplied source ID and span IDs.');
            return { sourceId: source.id, quote: span.quote };
          });
          validated = validateEvidence(resolveEndpoints(extractionSchema.parse({
            concepts: result.data.concepts.map(node => ({ ...node, citations: citations(node.citations) })),
            edges: result.data.edges.map(edge => ({ ...edge, citations: citations(edge.citations) })),
          }), known), [segment]);
          segmentMetadata.push({ ...result.metadata, promptVersion, sourceId: source.id, offset, attempt, validationError });
          break;
        } catch (error) {
          validationError = error instanceof Error ? error.message : 'Invalid graph evidence.';
          segmentMetadata.push({ ...result.metadata, promptVersion, sourceId: source.id, offset, attempt, validationError });
          if (attempt === 1) throw error;
        }
      }
      if (!validated) throw new Error('Graph evidence validation exhausted retries.');
      validateEvidence(validated, [segment]);
      if (!cached) await checkpoints?.save(checkpointKey, { extraction: validated, metadata: segmentMetadata });
      metadata.push(...segmentMetadata);
      extractions.push(validated);
      for (const concept of validated.concepts) {
        if (!known.some(item => item.key === concept.key)) known.push({ key: concept.key, label: concept.label, aliases: concept.aliases });
      }
      await onProgress?.(++progress, total);
    }
  }
  return { lectureId: lecture.id, title: lecture.title, sources: lecture.sources, extractions, metadata };
}
