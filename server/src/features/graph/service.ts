import type { Completion, Job, Lecture } from '../../../../shared/contracts/graph.ts';
import type { GraphRepository } from '../../db/graphRepository.ts';
import type { LectureSource } from '../../data/dataset.ts';
import { StructuredOutputError, type ModelProvider } from '../../llm/provider.ts';
import { ZodError } from 'zod';
import { extractLecture, promptVersion } from './harness.ts';
import { mergeLecture } from './resolve.ts';
import { mainConcepts, overviewVersion } from './overview.ts';
import { summarizeConcepts, summaryVersion } from './summaries.ts';

export class GraphError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}
export class GraphService {
  private admission: Promise<unknown> = Promise.resolve();
  private worker: Promise<unknown> = Promise.resolve();
  private abort = new AbortController();
  readonly pipeline: string;
  constructor(readonly repository: GraphRepository, readonly source: LectureSource, private provider: ModelProvider) {
    this.pipeline = `${promptVersion}/${overviewVersion}/${summaryVersion}/${provider.identity}`;
  }
  async recover() {
    const jobs = await this.repository.jobs();
    for (const job of jobs.reverse()) {
      if (job.state === 'queued' || job.state === 'running') this.enqueue(job);
    }
  }
  complete(event: Completion): Promise<Job> {
    // Serialize admissions as well as extraction to coalesce simultaneous duplicate events.
    const result = this.admission.then(() => this.accept(event));
    this.admission = result.catch(() => {});
    return result;
  }
  private async accept(event: Completion) {
    if (this.abort.signal.aborted) throw new GraphError('API is shutting down.', 503);
    let lecture: Lecture;
    try { lecture = await this.source.load(event.courseId, event.lectureId); }
    catch (error) { throw new GraphError(error instanceof Error ? error.message : 'Dataset is unavailable.', 422); }
    const id = `${event.courseId}/${event.lectureId}/${event.revision}`;
    const [existing, graph, jobs] = await Promise.all([
      this.repository.job(id), this.repository.graph(event.courseId), this.repository.jobs(event.courseId),
    ]);
    const indexed = graph.lectures.find(item => item.id === event.lectureId);
    const latestRevision = Math.max(indexed?.revision ?? 0, ...jobs.filter(job => job.lectureId === event.lectureId).map(job => job.revision));
    if (event.revision < latestRevision) throw new GraphError('Stale completion event. Use the latest lecture revision.');
    if (existing) {
      if (existing.contentHash !== lecture.contentHash) throw new GraphError('Materials changed for this revision. Send a higher revision after all files are saved.');
      if (existing.state === 'queued' || existing.state === 'running' || (existing.state === 'completed' && existing.pipeline === this.pipeline)) return existing;
    }
    const job: Job = { ...event, id, contentHash: lecture.contentHash, pipeline: this.pipeline,
      title: lecture.title, state: 'queued', progress: 0, total: 0, updatedAt: new Date().toISOString() };
    await this.repository.saveJob(job);
    this.enqueue(job);
    return job;
  }
  private enqueue(job: Job) {
    this.worker = this.worker.then(() => this.indexCompletedLecture(job)).catch(error => {
      // Repository failures should not become unhandled rejections or silently stall later jobs.
      console.error('Graph worker could not persist job status:', error instanceof Error ? error.message : 'Unknown error');
    });
  }
  async idle() { await this.admission; await this.worker; }
  async close() { this.abort.abort(); await this.idle(); }
  private async indexCompletedLecture(job: Job) {
    const update = async (values: Partial<Job>) => {
      Object.assign(job, values, { updatedAt: new Date().toISOString() });
      await this.repository.saveJob(job);
    };
    try {
      this.abort.signal.throwIfAborted();
      await update({ state: 'running', error: undefined });
      const previous = await this.repository.graph(job.courseId);
      const old = previous.lectures.find(item => item.id === job.lectureId);
      if (old && old.revision > job.revision) throw new Error('This job was superseded by a newer published lecture revision.');
      // Recovery after a crash between publishing a graph and marking its job complete.
      if (old?.revision === job.revision && old.contentHash === job.contentHash && old.pipeline === job.pipeline) {
        await update({ state: 'completed' }); return;
      }
      await update({ pipeline: this.pipeline });
      const lecture = await this.source.load(job.courseId, job.lectureId);
      if (lecture.contentHash !== job.contentHash) throw new Error('Lecture files changed after completion was submitted. Save all files and send a higher revision.');
      if (old?.contentHash === job.contentHash && old.pipeline === this.pipeline) {
        const graph = structuredClone(previous);
        graph.version = crypto.randomUUID(); graph.updatedAt = new Date().toISOString();
        graph.changes = { nodes: [], edges: [], lectureId: job.lectureId };
        Object.assign(graph.lectures.find(item => item.id === job.lectureId)!, { revision: job.revision, indexedAt: graph.updatedAt });
        await this.repository.publish(job.courseId, graph);
        await update({ state: 'completed' }); return;
      }
      const extractionPipeline = `${promptVersion}/${this.provider.identity}`;
      const candidates = await extractLecture(lecture, this.provider,
        previous.nodes.map(node => ({ key: node.id, label: node.label, aliases: node.aliases })), this.abort.signal,
        (progress, total) => update({ progress, total: total + 2 }), {
          load: key => this.repository.segment(`${job.id}/${extractionPipeline}/${key}`),
          save: (key, value) => this.repository.saveSegment(`${job.id}/${extractionPipeline}/${key}`, value),
        });
      const overviewPipeline = `${promptVersion}/${overviewVersion}/${this.provider.identity}`;
      const overview = await mainConcepts(candidates, job.courseId, this.provider, this.abort.signal, {
        load: key => this.repository.segment(`${job.id}/${overviewPipeline}/${key}`),
        save: (key, value) => this.repository.saveSegment(`${job.id}/${overviewPipeline}/${key}`, value),
      });
      await update({ progress: job.total - 1 });
      const indexed = await summarizeConcepts(overview, this.provider, this.abort.signal, {
        load: key => this.repository.segment(`${job.id}/${this.pipeline}/${key}`),
        save: (key, value) => this.repository.saveSegment(`${job.id}/${this.pipeline}/${key}`, value),
      });
      await update({ progress: job.total });
      // Refuse to publish a mixture if the writer modified sources while extraction was running.
      if ((await this.source.load(job.courseId, job.lectureId)).contentHash !== job.contentHash) {
        throw new Error('Lecture changed during extraction. Send a new completed revision.');
      }
      this.abort.signal.throwIfAborted();
      await this.repository.publish(job.courseId, mergeLecture(previous, indexed, job, lecture.contentHash, this.pipeline));
      await update({ state: 'completed', metadata: indexed.metadata });
    } catch (error) {
      const message = error instanceof ZodError
        ? 'The graph response did not match the required format. Retry the update; the existing graph is unchanged.'
        : error instanceof Error ? error.message : 'Graph extraction failed; previous graph retained.';
      await update({ state: 'failed', error: message, ...(error instanceof StructuredOutputError ? { metadata: [error.metadata] } : {}) });
    }
  }
}
