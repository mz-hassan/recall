import { z } from 'zod';
import { emptyGraph, extractionSchema, type Extraction, type IndexedLecture } from '../../../../shared/contracts/graph.ts';
import type { ModelProvider } from '../../llm/provider.ts';
import { mergeLecture } from './resolve.ts';
import { validateEvidence, type Checkpoints } from './harness.ts';
import { mainConceptLimit, overviewInstructions, overviewVersion } from './prompts/overview.ts';

export { overviewVersion };
const selectionSchema = z.object({ conceptKeys: z.array(z.string()).max(mainConceptLimit), edgeIds: z.array(z.string()).max(8) });
export function selectOverview(selection: z.infer<typeof selectionSchema>, candidates: ReturnType<typeof mergeLecture>): Extraction {
  selectionSchema.parse(selection);
  const ids = new Set(selection.conceptKeys), edgeIds = new Set(selection.edgeIds);
  if (ids.size !== selection.conceptKeys.length || edgeIds.size !== selection.edgeIds.length) throw new Error('Overview IDs must be unique.');
  if (selection.conceptKeys.some(id => !candidates.nodes.some(node => node.id === id))) throw new Error('Overview contains an unknown concept ID.');
  if (selection.edgeIds.some(id => !candidates.edges.some(edge => edge.id === id))) throw new Error('Overview contains an unknown relationship ID.');
  // Project onto the selected topics: a relationship must never pull a detail
  // node back into the overview, even if the model included its ID.
  const edges = candidates.edges.filter(edge => edgeIds.has(edge.id) && ids.has(edge.from) && ids.has(edge.to));
  const citations = (refs: (typeof candidates.nodes)[number]['references']) => refs.slice(0, 8).map(({ sourceId, quote }) => ({ sourceId, quote }));
  return extractionSchema.parse({
    concepts: selection.conceptKeys.map(id => {
      const node = candidates.nodes.find(node => node.id === id)!;
      return { key: node.id, label: node.label, aliases: node.aliases.slice(0, 12), citations: citations(node.references) };
    }),
    edges: edges.map(edge => ({ from: edge.from, to: edge.to, relation: edge.relation, citations: citations(edge.references) })),
  });
}
export async function mainConcepts(indexed: IndexedLecture, courseId: string, provider: ModelProvider, signal?: AbortSignal, checkpoints?: Checkpoints): Promise<IndexedLecture> {
  const key = 'lecture-overview';
  const cached = await checkpoints?.load(key);
  if (cached) {
    if (cached.extraction.concepts.length > mainConceptLimit) throw new Error('Cached overview exceeds the main concept budget.');
    validateEvidence(cached.extraction, indexed.sources);
    return { ...indexed, extractions: [cached.extraction], metadata: [...indexed.metadata, ...cached.metadata] };
  }
  const candidates = mergeLecture(emptyGraph(), indexed, { courseId, lectureId: indexed.lectureId, revision: 1 }, '', 'candidates');
  if (!candidates.nodes.length) return { ...indexed, extractions: [{ concepts: [], edges: [] }] };
  let validationError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.generateStructured({ task: 'graph.main-concepts', instructions: overviewInstructions, schema: selectionSchema, signal,
      evidence: { lecture: indexed.title, ...(validationError ? { validationError } : {}),
        materials: indexed.sources.map(source => ({ title: source.title, text: source.text })),
        concepts: candidates.nodes.map(node => ({ id: node.id, label: node.label, aliases: node.aliases, evidenceCount: node.references.length })),
        edges: candidates.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, relation: edge.relation })),
      },
    });
    try {
      const extraction = selectOverview(result.data, candidates);
      validateEvidence(extraction, indexed.sources);
      const metadata = [{ ...result.metadata, overviewVersion, attempt }];
      await checkpoints?.save(key, { extraction, metadata });
      return { ...indexed, extractions: [extraction], metadata: [...indexed.metadata, ...metadata] };
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Invalid lecture overview.';
      if (attempt === 1) throw error;
    }
  }
  throw new Error('Lecture overview selection failed.');
}
