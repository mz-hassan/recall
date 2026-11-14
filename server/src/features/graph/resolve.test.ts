import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLecture } from './resolve.ts';
import { emptyGraph } from '../../../../shared/contracts/graph.ts';
import { TestSource } from './testSupport.ts';

test('shared mathematical aliases do not merge state, action, and optimal value concepts', async () => {
  const lecture = await new TestSource().load('ai', '1');
  const citations = [{ sourceId: lecture.sources[0].id, quote: lecture.sources[0].text }];
  const concepts = [
    { key: 'state_value', label: 'State Value Function', aliases: ['V', 'V*'], citations },
    { key: 'action_value', label: 'Action Value Function', aliases: ['Q', 'Q*'], citations },
    { key: 'optimal_value', label: 'Optimal Value Function', aliases: ['V*', 'Q*'], citations },
  ];
  const result = mergeLecture(emptyGraph(), { lectureId: lecture.id, title: lecture.title, sources: lecture.sources,
    extractions: [{ concepts, edges: [] }], metadata: [] }, { courseId: 'ai', lectureId: '1', revision: 1 }, lecture.contentHash, 'test');
  assert.equal(result.nodes.length, 3);
  assert.deepEqual(result.nodes.map(node => node.label), concepts.map(node => node.label));
});
