import { readFileSync } from 'node:fs';
import { emptyGraph, extractionSchema, type Graph, type Job, type Lecture } from '../../../../shared/contracts/graph.ts';
import { digest, type LectureSource } from '../../data/dataset.ts';
import type { GraphRepository } from '../../db/graphRepository.ts';
import type { ModelProvider, GenerateArgs } from '../../llm/provider.ts';
import type { SegmentResult } from './harness.ts';

export const fixtures = JSON.parse(readFileSync(new URL('./__tests__/fixtures/lectures.json', import.meta.url), 'utf8')) as {
  id: string; title: string; text: string; concepts: { key: string; label: string; aliases: string[] }[];
  edges: { from: string; to: string; relation: 'uses' }[];
}[];
export class MemoryRepository implements GraphRepository {
  graphs = new Map<string, Graph>(); records = new Map<string, Job>();
  segments = new Map<string, SegmentResult>();
  async graph(courseId: string) { return structuredClone(this.graphs.get(courseId) ?? emptyGraph()); }
  async publish(courseId: string, graph: Graph) { this.graphs.set(courseId, structuredClone(graph)); }
  async jobs(courseId?: string) { return structuredClone([...this.records.values()].filter(job => !courseId || job.courseId === courseId)); }
  async job(id: string) { return structuredClone(this.records.get(id) ?? null); }
  async saveJob(job: Job) { this.records.set(job.id, structuredClone(job)); }
  async segment(key: string) { return structuredClone(this.segments.get(key) ?? null); }
  async saveSegment(key: string, value: SegmentResult) { this.segments.set(key, structuredClone(value)); }
}
export class TestSource implements LectureSource {
  lectures: Lecture[] = fixtures.map(item => ({ courseId: 'ai', id: item.id, title: item.title,
    contentHash: digest(item.text), sources: [{ id: digest('fixture.txt').slice(0, 24), title: item.title, text: item.text, hash: digest(item.text), path: 'fixture.txt' }] }));
  async load(_courseId: string, id: string) {
    const item = this.lectures.find(lecture => lecture.id === id);
    if (!item) throw new Error('Missing lecture');
    return structuredClone(item);
  }
  async list() { return this.lectures.map(item => ({ id: item.id, title: item.title, available: true })); }
  revise(id: string, text: string) {
    const lecture = this.lectures.find(item => item.id === id)!;
    lecture.contentHash = digest(text); lecture.sources[0].text = text; lecture.sources[0].hash = digest(text);
  }
}
export class TestProvider implements ModelProvider {
  identity = 'test/fixture-v1'; calls = 0; invalid = false;
  overviewCalls = 0;
  summaryCalls = 0;
  beforeGenerate?: () => Promise<void>;
  async generateStructured<T>({ task, evidence, schema }: GenerateArgs<T>) {
    if (task === 'graph.summarize-concepts') {
      this.summaryCalls++;
      const input = evidence as { concepts: { key: string; label: string; evidence: { quote: string }[] }[] };
      return { data: schema.parse({ summaries: input.concepts.map(node => ({ conceptKey: node.key,
        summary: `${node.label} is a main idea in this lecture. ${node.evidence[0].quote}`,
      })) }), metadata: { provider: 'test', model: 'fixture-v1', latencyMs: 0 } };
    }
    if (task === 'graph.main-concepts') {
      this.overviewCalls++;
      const input = evidence as { concepts: { id: string }[]; edges: { id: string; from: string; to: string }[] };
      const ids = input.concepts.slice(0, 6).map(node => node.id);
      return { data: schema.parse({ conceptKeys: ids, edgeIds: input.edges.filter(edge => ids.includes(edge.from) && ids.includes(edge.to)).slice(0, 8).map(edge => edge.id) }),
        metadata: { provider: 'test', model: 'fixture-v1', latencyMs: 0 } };
    }
    this.calls++; await this.beforeGenerate?.();
    const input = evidence as { lecture: string; source: { id: string; text: string; spans: { id: string; quote: string }[] } };
    const fixture = fixtures.find(item => item.title === input.lecture)!;
    const citations = [{ sourceId: input.source.id, spanId: this.invalid ? 'invented-span' : input.source.spans[0].id }];
    return { data: schema.parse({
      concepts: fixture.concepts.map(concept => ({ ...concept, citations })),
      edges: fixture.edges.map(edge => ({ ...edge, citations })),
    }), metadata: { provider: 'test', model: 'fixture-v1', latencyMs: 0 } };
  }
}
