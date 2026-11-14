import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainConcepts, selectOverview } from './overview.ts';
import { emptyGraph, type Graph, type IndexedLecture } from '../../../../shared/contracts/graph.ts';
import { TestProvider, TestSource } from './testSupport.ts';
import { mergeLecture } from './resolve.ts';

async function candidates() {
  const lecture = await new TestSource().load('ai', '1');
  const citations = [{ sourceId: lecture.sources[0].id, quote: lecture.sources[0].text }];
  const indexed: IndexedLecture = { lectureId: lecture.id, title: lecture.title, sources: lecture.sources, metadata: [],
    extractions: [0, 1, 2].map(segment => ({ concepts: Array.from({ length: 5 }, (_, index) => ({
      key: `topic-${segment}-${index}`, label: `Topic ${segment}-${index}`, aliases: [], citations,
    })), edges: [] })),
  };
  const graph = mergeLecture(emptyGraph(), indexed, { courseId: 'ai', lectureId: '1', revision: 1 }, lecture.contentHash, 'test');
  return { indexed, graph };
}
test('main-topic budget applies to the entire lecture across multiple source segments', async () => {
  const { indexed } = await candidates();
  const result = await mainConcepts(indexed, 'ai', new TestProvider());
  assert.equal(indexed.extractions.flatMap(part => part.concepts).length, 15);
  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0].concepts.length, 6);
  assert.ok(result.extractions[0].concepts.every(node => node.citations[0].quote === indexed.sources[0].text));
});
test('overview rejects excess/fabricated topics and omits links that would reintroduce detail nodes', async () => {
  const { graph } = await candidates();
  assert.throws(() => selectOverview({ conceptKeys: graph.nodes.slice(0, 7).map(node => node.id), edgeIds: [] }, graph));
  assert.throws(() => selectOverview({ conceptKeys: ['invented'], edgeIds: [] }, graph), /unknown concept/);
  const withEdge: Graph = { ...graph, edges: [{ id: 'edge', from: graph.nodes[0].id, to: graph.nodes[1].id, relation: 'uses', lectureIds: ['1'], references: graph.nodes[0].references }] };
  assert.equal(selectOverview({ conceptKeys: [graph.nodes[0].id], edgeIds: ['edge'] }, withEdge).edges.length, 0);
  const result = selectOverview({ conceptKeys: [graph.nodes[0].id], edgeIds: [] }, withEdge);
  assert.equal(result.concepts.length, 1); assert.equal(result.edges.length, 0);
});
