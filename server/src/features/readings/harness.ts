import { z } from 'zod';
import { Annotation, Answer, Diagram, TeacherResponse, type TeacherInput, type TeacherOutput } from '../../../../shared/contracts/readings.ts';
import { ProviderError, type Evidence, type ModelProvider } from '../../llm/index.ts';
import { teacherPrompt } from './prompts/teacher.ts';

export const TEACHER_TASK = 'readings.teacher';

/** What the model returns. The server adds the request ID and provider metadata. */
const TeacherModelOutput = Answer.extend({ annotations: z.array(Annotation).max(8).default([]), diagrams: z.array(Diagram).max(2).default([]) });
export type TeacherModelOutput = z.infer<typeof TeacherModelOutput>;

export function validateReferences(value: any, bundle: any) {
  const known = new Set(bundle.passages.map((p: any) => p.id));
  const requireId = (id: string) => { if (!known.has(id)) throw new Error(`Unknown passage: ${id}`); };
  for (const block of value.blocks ?? []) block.citations.forEach(requireId);
  for (const a of value.annotations ?? []) requireId(a.passageId);
  for (const diagram of value.diagrams ?? []) {
    const ids = new Set(diagram.nodes.map((n: any) => n.id));
    if (ids.size !== diagram.nodes.length) throw new Error('Diagram node IDs must be unique.');
    diagram.nodes.forEach((n: any) => requireId(n.passageId));
    diagram.edges.forEach((e: any) => { if (!ids.has(e.from) || !ids.has(e.to)) throw new Error('Diagram edge has no node.'); });
  }
}

/** The shared schema plus this paper's citation rules, so a bad ID is retried by the provider like any invalid output. */
function teacherSchema(bundle: any) {
  return TeacherModelOutput.superRefine((value, ctx) => {
    try { validateReferences(value, bundle); }
    catch (error) { ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid reference.' }); }
  });
}

const words = (text: string) => text.toLowerCase().split(/\W+/).filter(term => term.length > 2);
const stripRects = ({ rects, ...rest }: any) => rest;

/** Server-side retrieval: passages on the selected pages, plus the best keyword matches for the question. */
function selectEvidence(input: TeacherInput, bundle: any, selected: any) {
  const firstPage = selected?.page || input.context?.page || 1;
  const lastPage = input.context?.endPage || firstPage;
  const onPages = bundle.passages.filter((p: any) => p.page >= firstPage && p.page <= lastPage);
  const terms = words(input.question + ' ' + (input.context?.quote ?? ''));
  const matches = bundle.passages
    .map((p: any) => ({ p, score: terms.reduce((sum, term) => sum + Number((p.quote + ' ' + (p.explanation ?? '')).toLowerCase().includes(term)), 0) }))
    .filter(({ score }: any) => score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 6).map(({ p }: any) => p);
  const chosen = new Map<string, any>();
  for (const passage of [...onPages, ...matches]) chosen.set(passage.id, passage);
  return [...chosen.values()].slice(0, 14);
}

export async function teach(input: TeacherInput, bundle: any, provider: ModelProvider, signal: AbortSignal): Promise<TeacherOutput> {
  const context = input.context;
  if (context && (context.page > bundle.pageCount || (context.endPage && (context.endPage > bundle.pageCount || context.endPage < context.page)))) throw new Error('Selected page does not exist.');
  const selected = context?.passageId && bundle.passages.find((p: any) => p.id === context.passageId);
  if (context?.passageId && !selected) throw new Error('Selected passage does not exist.');
  signal.throwIfAborted();
  // A client quote is a question context, not authoritative document evidence.
  const passages = selectEvidence(input, bundle, selected);
  if (!passages.length) throw new Error('The teacher could not produce a grounded answer. Try a narrower question.');
  const highlights = new Map<string, any>(bundle.highlights.map((h: any) => [h.id, h]));
  const evidence: Evidence[] = [
    { id: 'paper-overview', kind: 'text', text: JSON.stringify({ overview: bundle.overview, sections: bundle.sections, highlights: bundle.highlights.map(stripRects) }) },
    ...passages.map((p: any): Evidence => ({ id: p.id, kind: 'text', text: JSON.stringify({ page: p.page, quote: p.quote, explanation: highlights.get(p.id)?.explanation }) })),
    { id: 'conversation', kind: 'text', text: JSON.stringify({ history: input.history, question: input.question, selection: context }) },
  ];
  let result;
  try {
    result = await provider.generateStructured({
      task: TEACHER_TASK, instructions: teacherPrompt, evidence, schema: teacherSchema(bundle), signal,
      options: { maxOutputTokens: 3000, reasoning: 'off' },
    });
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'invalid_output') throw new Error('The teacher could not produce a grounded answer. Try a narrower question.');
    throw error;
  }
  return TeacherResponse.parse({ ...result.data, requestId: input.requestId, provider: result.provider, model: result.model });
}
