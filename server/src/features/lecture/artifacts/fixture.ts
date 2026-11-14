import type { Fixture } from '../../../llm/fixture.ts';
import type { ModelProvider } from '../../../llm/types.ts';
import type { ChatContext } from '../chat/context.ts';
import { ARTIFACT_TASK } from './schema.ts';

export const artifactFixture: Fixture = ({ evidence }) => {
  const item = evidence.find(value => value.id === 'artifact-context');
  const context: ChatContext & { kind: 'chart' | 'animation' } = JSON.parse(item?.kind === 'text' ? item.text : '{}');
  const moment = context.moments[0];
  if (!moment?.quote) return { spec: null, momentIds: [], insufficientEvidence: true, reason: 'No transcript evidence is available for this moment.' };
  const common = { momentIds: [moment.id], insufficientEvidence: false, reason: '' };
  if (context.kind === 'chart') {
    const counts = context.chunks.map(chunk => chunk.text.match(/\S+/g)?.length ?? 0);
    // A single chunk is represented as start/end coverage, without inventing data.
    const values = counts.length >= 2 ? counts : [0, counts[0] ?? moment.quote.split(/\s+/).length];
    return { ...common, spec: {
      kind: 'chart', title: 'Transcript evidence coverage', description: 'Word counts in the transcript chunks used as evidence for this moment. This is an offline rendering fixture.',
      chartType: 'bar', basis: 'evidence', xLabel: counts.length >= 2 ? 'Chunk' : 'Coverage stage', yLabel: 'Words',
      xValues: values.map((_, index) => index + 1), series: [{ label: 'Transcript words', values }], equations: [],
    } };
  }
  const sentences = moment.quote.match(/[^.!?]+[.!?]?/g)?.map(text => text.trim()).filter(Boolean).slice(0, 3) ?? [moment.quote];
  const descriptions = sentences.length >= 2 ? sentences : [sentences[0]!, 'Review the quoted transcript to connect the idea to the lecture.'];
  return { ...common, spec: {
    kind: 'animation', title: 'Follow this moment', description: 'A step-by-step review of the source transcript. This is an offline rendering fixture.',
    nodes: descriptions.map((_, index) => ({ id: 'step' + index, label: 'Idea ' + (index + 1) })),
    edges: descriptions.slice(1).map((_, index) => ({ from: 'step' + index, to: 'step' + (index + 1), label: 'then' })),
    steps: descriptions.map((description, index) => ({ title: 'Idea ' + (index + 1), description: description.slice(0, 1000), highlightNodeIds: ['step' + index] })), equations: [],
  } };
};

export function registerArtifactFixture(provider: ModelProvider) {
  if ('register' in provider && typeof provider.register === 'function') provider.register(ARTIFACT_TASK, artifactFixture);
}
