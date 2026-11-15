import { z } from 'zod';
import { TimeSource } from './lecture.ts';

// Student-side contracts (Helly). The pipeline's lecture.ts contract stays unchanged.
export const CURATED_BC_RUN_ID = 'curated:ai:2';

export const ChatRequest = z.object({
  requestId: z.uuid().optional(),
  runId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
  context: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('moment'), momentId: z.string().min(1) }),
    z.object({ kind: z.literal('recent'), seconds: z.literal(180) }),
  ]),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatCitation = z.object({
  momentId: z.string(), title: z.string(), label: z.string(), time: z.number().nonnegative(),
});
export const ChatAnswer = z.object({
  runId: z.string(), answer: z.string().min(1),
  citations: z.array(ChatCitation), insufficientEvidence: z.boolean(),
  range: z.object({ from: z.number().nonnegative(), to: z.number().nonnegative(), timeSource: TimeSource }),
  provider: z.string(), model: z.string(),
});
export type ChatAnswer = z.infer<typeof ChatAnswer>;

const Text = z.string().trim().min(1);
const EquationSpec = z.object({ expression: Text.max(1000), explanation: Text.max(1000) }).strict();
const ChartSpec = z.object({
  kind: z.literal('chart'), title: Text.max(180), description: Text.max(1500),
  chartType: z.enum(['line', 'bar']), basis: z.enum(['evidence', 'illustrative']),
  xLabel: Text.max(100), yLabel: Text.max(100),
  xValues: z.array(z.number().finite().min(-1e6).max(1e6)).min(2).max(50),
  series: z.array(z.object({ label: Text.max(80), values: z.array(z.number().finite().min(-1e12).max(1e12)).min(2).max(50) }).strict()).min(1).max(4),
  equations: z.array(EquationSpec).max(4),
}).strict();
const NodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
const AnimationSpec = z.object({
  kind: z.literal('animation'), title: Text.max(180), description: Text.max(1500),
  nodes: z.array(z.object({ id: NodeId, label: Text.max(100) }).strict()).min(1).max(8),
  edges: z.array(z.object({ from: NodeId, to: NodeId, label: Text.max(100) }).strict()).max(12),
  steps: z.array(z.object({ title: Text.max(120), description: Text.max(1000), highlightNodeIds: z.array(NodeId).min(1).max(8) }).strict()).min(2).max(8),
  equations: z.array(EquationSpec).max(4),
}).strict();

// Models supply data only. Unknown fields (including code, HTML or SVG) are rejected.
export const ArtifactSpec = z.discriminatedUnion('kind', [ChartSpec, AnimationSpec]).superRefine((spec, ctx) => {
  if (spec.kind === 'chart') {
    if (spec.series.some(series => series.values.length !== spec.xValues.length)) ctx.addIssue({ code: 'custom', message: 'Chart series must match the x axis.' });
    if (new Set(spec.series.map(series => series.label)).size !== spec.series.length) ctx.addIssue({ code: 'custom', message: 'Chart series labels must be unique.' });
    if (spec.xValues.some((value, index) => index > 0 && value <= spec.xValues[index - 1]!)) ctx.addIssue({ code: 'custom', message: 'Chart x values must increase.' });
  } else {
    const ids = new Set(spec.nodes.map(node => node.id));
    if (ids.size !== spec.nodes.length || spec.edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to)) ||
        spec.steps.some(step => step.highlightNodeIds.some(id => !ids.has(id)))) {
      ctx.addIssue({ code: 'custom', message: 'Animation references must resolve to unique nodes.' });
    }
  }
});
export type ArtifactSpec = z.infer<typeof ArtifactSpec>;

export const ArtifactRequest = z.object({
  runId: Text, requestId: z.uuid(), momentId: Text,
  prompt: Text.max(2000), kind: z.enum(['chart', 'animation']),
});
export type ArtifactRequest = z.infer<typeof ArtifactRequest>;

export const GeneratedArtifact = z.object({
  id: z.uuid(), runId: Text, requestId: z.uuid(), momentId: Text,
  prompt: Text.max(2000), spec: ArtifactSpec,
  citations: z.array(ChatCitation).min(1).max(12),
  provider: Text, model: Text, createdAt: z.iso.datetime(),
});
export type GeneratedArtifact = z.infer<typeof GeneratedArtifact>;
