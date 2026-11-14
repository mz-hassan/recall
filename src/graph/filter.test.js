import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterGraph } from './filter.js';
const graph = {
  nodes: [
    { id: 'bc', label: 'Behavior cloning', aliases: ['BC'], lectureIds: ['1', '3'] },
    { id: 'policy', label: 'Policy', aliases: [], lectureIds: ['1', '3'] },
    { id: 'rl', label: 'Reinforcement learning', aliases: ['RL'], lectureIds: ['3'] },
    { id: 'reward', label: 'Reward', aliases: [], lectureIds: ['3'] },
  ],
  edges: [
    { from: 'bc', to: 'policy', relation: 'uses', lectureIds: ['1', '3'] },
    { from: 'rl', to: 'policy', relation: 'uses', lectureIds: ['3'] },
    { from: 'rl', to: 'reward', relation: 'depends_on', lectureIds: ['3'] },
  ],
};
test('lecture/relation filters keep resolvable endpoints and exclude unrelated lectures', () => {
  const result = filterGraph(graph, { lecture: '1', relation: 'uses' });
  assert.deepEqual(result.nodes.map(node => node.id), ['bc', 'policy']);
  assert.equal(result.edges.length, 1);
});
test('alias search and neighbor inspection include one-hop connections only', () => {
  const result = filterGraph(graph, { search: 'BC' });
  assert.deepEqual(result.nodes.map(node => node.id), ['bc', 'policy']);
  const neighbors = filterGraph(graph, { selected: 'policy', neighborsOnly: true });
  assert.deepEqual(neighbors.nodes.map(node => node.id), ['bc', 'policy', 'rl']);
});
