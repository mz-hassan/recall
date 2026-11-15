import { DatasetSource } from '../server/src/data/dataset.ts';
import { connectGraphRepository } from '../server/src/db/graphRepository.ts';

const courseId = 'ai';
const version = 'curated-local-v2';
const source = new DatasetSource();
const lectures = await Promise.all(['1', '2', '3', '4'].map(id => source.load(courseId, id)));
const byId = new Map(lectures.map(lecture => [lecture.id, lecture]));

function reference(lectureId, anchor) {
  for (const item of byId.get(lectureId).sources.filter(item => item.path.includes('/slides/'))) {
    const start = item.text.indexOf(anchor);
    if (start < 0) continue;
    return { lectureId, sourceId: item.id, sourceHash: item.hash, quote: anchor, start, end: start + anchor.length,
      title: item.title, path: item.path, url: item.url, page: item.page };
  }
  throw new Error('Missing citation in lecture ' + lectureId + ': ' + anchor);
}

const supervised = reference('1', 'Straightforward supervised learning problem');
const shift = reference('2', 'the distribution of states the\nlearner visits depends on the learner’s own policy.');
const errors = reference('2', 'The learner can end up in states that are\nout of distribution w.r.t. training data,\nleading to compounding error.');
const dagger = reference('2', 'Key idea: Repeat: (1) run the current policy to observe states it actually visits, (2) ask\nthe expert for actions for those states');
const recovery = reference('2', 'Understanding u: the “recoverability” constant');
const rl = reference('3', 'learn from trial and error');
const mdp = reference('3', 'Markov Decision Process (MDP)');
const value = reference('3', 'Expected return from state s under');
const reward = reference('3', 'Goal: Find optimal policy');
const hacking = reference('3', 'Reward hacking: unintended solutions');
const proxy = reference('4', 'optimizing any fixed incomplete proxy eventually leads the principal to be\narbitrarily worse off');
const specification = reference('4', 'How bad is an incomplete specification?');

const concepts = [
  ['imitation', 'Imitation learning', 'Learn behavior from an expert’s demonstrations or corrective labels.', [supervised, dagger], []],
  ['bc', 'Behavior cloning', 'Treat expert state-action examples as supervised training data. At deployment, the policy must act in the states its own decisions produce.', [supervised, shift], ['BC']],
  ['shift', 'Distribution shift', 'The learner can visit states absent from expert demonstrations because its actions affect which states come next.', [shift, errors], ['Covariate shift']],
  ['errors', 'Compounding errors', 'One mistake can move the learner into unfamiliar states and trigger further mistakes. The worst-case excess cost can grow quadratically with the horizon.', [errors], []],
  ['dagger', 'DAgger', 'Roll out the learner, ask the expert to label visited states, add those labels to the training set, and retrain.', [dagger], ['Dataset Aggregation']],
  ['recovery', 'Recoverability', 'How easily a policy can return to good behavior after a mistake determines how long that mistake affects future cost.', [recovery], []],
  ['rl', 'Reinforcement learning', 'Learn a policy through interaction and reward feedback, with the goal of maximizing expected return.', [rl, reward], ['RL']],
  ['mdp', 'Markov decision process', 'Represent sequential decisions with states, actions, transition dynamics and rewards.', [mdp], ['MDP']],
  ['value', 'Value function', 'Estimate the expected future return from a state under a policy. Action values also condition on the initial action.', [value], ['State value']],
  ['reward', 'Reward optimization', 'Use the specified reward to judge behavior over time. The resulting policy can exploit a mismatch between that specification and the intended goal.', [reward, proxy], []],
  ['hacking', 'Reward hacking', 'A policy scores well on the specified reward by finding an unintended solution that can perform poorly on the underlying goal.', [hacking, proxy], []],
  ['proxy', 'Incomplete reward specification', 'A proxy can reward some attributes while leaving others out. Strong optimization can exploit those omissions.', [specification, proxy], ['Proxy reward']],
];
const connections = [
  ['bc', 'imitation', 'is_a', [supervised, dagger]],
  ['errors', 'shift', 'depends_on', [errors]],
  ['dagger', 'imitation', 'is_a', [dagger]],
  ['dagger', 'shift', 'addresses', [dagger, shift]],
  ['dagger', 'errors', 'addresses', [dagger, errors]],
  ['errors', 'recovery', 'depends_on', [errors, recovery]],
  ['rl', 'imitation', 'contrasts_with', [rl, supervised]],
  ['rl', 'mdp', 'uses', [rl, mdp]],
  ['rl', 'value', 'uses', [reward, value]],
  ['rl', 'reward', 'uses', [rl, reward]],
  ['hacking', 'proxy', 'depends_on', [hacking, proxy]],
  ['hacking', 'reward', 'depends_on', [reward, proxy]],
];
const lectureIds = references => [...new Set(references.map(ref => ref.lectureId))].sort();
const nodes = concepts.map(([id, label, summary, references, aliases]) => ({ id, label, summary, references, aliases, lectureIds: lectureIds(references) }));
const edges = connections.map(([from, to, relation, references]) => ({ id: [from, relation, to].join(':'), from, to, relation, references, lectureIds: lectureIds(references) }));
const { client, repository } = await connectGraphRepository(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', process.env.MONGODB_DB || 'recall');
try {
  const existing = await repository.graph(courseId);
  if (existing.version && !existing.version.startsWith('curated-local-')) throw new Error('A different graph already occupies the configured database.');
  if (existing.version !== version) {
    const indexedAt = new Date().toISOString();
    await repository.publish(courseId, { version, updatedAt: indexedAt, nodes, edges,
      changes: { nodes: [], edges: [] },
      lectures: lectures.map(({ id, title, contentHash }) => ({ id, title, contentHash, pipeline: 'curated-local', revision: 1, indexedAt })) });
  }
  console.log('Local demo graph:', nodes.length, 'concepts,', edges.length, 'connections');
} finally {
  await client.close();
}
