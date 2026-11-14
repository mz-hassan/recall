import { randomUUID } from 'node:crypto';
import type { LectureKey } from '../../../../../shared/contracts/lecture.ts';
import { GeneratedArtifact, type ArtifactRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import { ProviderError, type ModelProvider } from '../../../llm/types.ts';
import type { LectureStore } from '../store/types.ts';
import { ChatContextError, retrieveChatContext } from '../chat/context.ts';
import { ARTIFACT_INSTRUCTIONS } from './prompts/v1.ts';
import { ARTIFACT_TASK, ArtifactOutput } from './schema.ts';

export class ArtifactRequestError extends Error {
  readonly statusCode: 404 | 409 | 422;
  constructor(statusCode: 404 | 409 | 422, message: string) { super(message); this.statusCode = statusCode; }
}

// Same lifetime as the existing lecture store. Browser reloads fetch saved specs;
// restarting a lecture or the server clears them. No duplicate model call on retry.
export function createArtifactService({ store, provider }: { store: LectureStore; provider: ModelProvider }) {
  type Run = { runId: string; records: Map<string, GeneratedArtifact>; requests: Map<string, { fingerprint: string; result: Promise<GeneratedArtifact> }> };
  const runs = new Map<string, Run>();
  function runFor(key: LectureKey, runId: string) {
    if (store.getSession(key)?.runId !== runId) throw new ChatContextError(409, 'The lecture restarted. Use the current timeline.');
    const id = key.courseId + '/' + key.lectureId;
    let run = runs.get(id);
    if (!run || run.runId !== runId) { run = { runId, records: new Map(), requests: new Map() }; runs.set(id, run); }
    return run;
  }
  async function generate(key: LectureKey, input: ArtifactRequest, run: Run, signal?: AbortSignal): Promise<GeneratedArtifact> {
    const context = retrieveChatContext(store, key, { runId: input.runId, question: input.prompt, context: { kind: 'moment', momentId: input.momentId } });
    const result = await provider.generateStructured({
      task: ARTIFACT_TASK, instructions: ARTIFACT_INSTRUCTIONS, schema: ArtifactOutput,
      evidence: [{ id: 'artifact-context', kind: 'text', text: JSON.stringify({ ...context, kind: input.kind }) }],
      options: { reasoning: 'off', temperature: 0.2, maxOutputTokens: 3000 }, ...(signal && { signal }),
    });
    if (signal?.aborted) throw new ProviderError('aborted', 'Artifact request was cancelled.');
    runFor(key, input.runId);
    const output = ArtifactOutput.parse(result.data);
    if (output.insufficientEvidence || !output.spec) throw new ArtifactRequestError(422, output.reason || 'There is not enough lecture evidence to create this visual.');
    if (output.spec.kind !== input.kind || !output.momentIds.length || output.momentIds.some(id => !context.moments.some(moment => moment.id === id))) {
      throw new ProviderError('invalid_output', 'Artifact kind or evidence citations are invalid.');
    }
    const artifact = GeneratedArtifact.parse({
      id: randomUUID(), runId: input.runId, requestId: input.requestId, momentId: input.momentId, prompt: input.prompt,
      spec: output.spec, citations: [...new Set(output.momentIds)].map(id => {
        const moment = context.moments.find(item => item.id === id)!;
        return { momentId: moment.id, title: moment.title, label: moment.label, time: moment.time };
      }), provider: result.provider, model: result.model, createdAt: new Date().toISOString(),
    });
    run.records.set(artifact.id, artifact);
    try {
      store.attachArtifact(key, input.momentId, { id: artifact.id, kind: artifact.spec.kind, title: artifact.spec.title,
        url: `/api/lectures/${encodeURIComponent(key.courseId)}/${encodeURIComponent(key.lectureId)}/artifacts/${artifact.id}?runId=${encodeURIComponent(input.runId)}` });
    } catch (error) { run.records.delete(artifact.id); throw error; }
    return artifact;
  }
  return {
    create(key: LectureKey, input: ArtifactRequest, signal?: AbortSignal) {
      const run = runFor(key, input.runId);
      const fingerprint = JSON.stringify([input.momentId, input.kind, input.prompt]);
      const previous = run.requests.get(input.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ArtifactRequestError(409, 'Use a new request ID for a different artifact request.');
        return previous.result;
      }
      const result = generate(key, input, run, signal).catch(error => { run.requests.delete(input.requestId); throw error; });
      run.requests.set(input.requestId, { fingerprint, result });
      return result;
    },
    get(key: LectureKey, runId: string, id: string) {
      const artifact = runFor(key, runId).records.get(id);
      if (!artifact || !store.getMoment(key, artifact.momentId)) throw new ArtifactRequestError(404, 'This artifact is not available in the current lecture.');
      return artifact;
    },
  };
}
