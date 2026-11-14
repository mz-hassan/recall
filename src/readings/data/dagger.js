import extracted from './dagger-pages.json' with { type: 'json' };

const definitions = [
  ['motivation', 1, 71, 75, 'claim', 'Your actions change your inputs', 'A learner changes the states it visits through its own actions. Training only on expert demonstrations can miss the situations the learner will encounter.', 'introduction'],
  ['errors', 1, 90, 93, 'claim', 'Why errors compound', 'One mistake can take the learner into unfamiliar states, where further mistakes become more likely. This is the distribution mismatch DAgger addresses.', 'introduction'],
  ['notation', 2, 57, 78, 'definition', 'Policy, horizon, and state distribution', 'A policy maps observations to actions. T is the number of steps in a task. The state distribution depends on which policy generated the trajectory.', 'preliminaries'],
  ['objective', 2, 235, 256, 'algorithm', 'Equation 1: learn on your own distribution', 'The objective measures imitation loss on states visited by the policy being learned. Changing the policy also changes this distribution, making this different from ordinary supervised learning.', 'preliminaries'],
  ['algorithm', 4, 1, 77, 'algorithm', 'Algorithm 3.1: the DAgger loop', 'Roll out the current policy (optionally mixed with the expert), ask the expert to label visited states, append these examples to all previous data, and retrain. Select the best policy on validation.', 'dagger'],
  ['aggregation', 4, 78, 98, 'definition', 'Keep the accumulated experience', 'Each new policy is trained on the aggregate of all datasets collected so far. This is the connection to Follow-The-Leader: choose a policy that fits the accumulated experience.', 'dagger'],
  ['expert', 4, 99, 122, 'definition', 'Expert labels versus expert control', 'Expert labeling supplies training targets for visited states. Expert control is a separate, optional mixture during rollout, especially useful early when the learner makes many mistakes.', 'dagger'],
  ['assumptions', 4, 194, 243, 'claim', 'Read the assumptions before the guarantee', 'The introductory DAgger guarantee assumes a bounded strongly convex surrogate loss and decaying expert mixing. Its first statement is an infinite-sample result; later statements address finite data.', 'theory'],
  ['no-regret', 5, 1, 55, 'algorithm', 'Equation 3: what no regret means', 'Average regret compares the sequence of chosen policies with the best fixed policy in hindsight on the same sequence of losses. No regret means this average gap tends to zero, not that the learner makes no mistakes.', 'theory'],
  ['limits', 5, 657, 662, 'claim', 'A stronger learning assumption', 'The authors explicitly require a no-regret method or a strongly convex surrogate loss. The theory is not an unconditional promise that any classifier will succeed.', 'theory'],
  ['mario', 7, 212, 224, 'claim', 'The recovery behavior demonstrations miss', 'In the Mario experiment, a supervised learner can become stuck near obstacles because the expert usually jumps earlier. Iterative methods encounter those states and learn how to recover.', 'experiments'],
  ['ocr', 8, 72, 78, 'claim', 'Finding: handwriting recognition', 'The reported character accuracies are 82% without structure, 83.6% for supervised training with the previous character correctly labeled, and 85.5% with DAgger. These are results on this OCR experiment, not universal gains.', 'experiments'],
  ['future', 8, 153, 170, 'claim', 'What remains open', 'The paper proposes richer structured-prediction decoding and connections to inverse optimal control and reinforcement learning as future work, rather than claiming to have solved those settings.', 'future'],
];

function cleanText(lines) {
  return lines.map(l => l.text).join(' ').replace(/-\s+(?=[a-z])/g, '').replace(/\s+/g, ' ').trim();
}
const validRect = r => Object.values(r).every(Number.isFinite) && r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.x + r.width <= 1.001 && r.y + r.height <= 1.001;
const highlights = definitions.map(([id, page, start, end, kind, title, explanation, sectionId]) => {
  const lines = extracted.pages[page - 1].lines.slice(start, end + 1);
  return { id, page, kind, title, explanation, sectionId, quote: cleanText(lines), rects: lines.map(l => l.rect).filter(validRect) };
});
const sections = [
  { id: 'introduction', title: '1. Introduction', page: 1, summary: 'Sequential predictions affect future inputs. Expert-only training can therefore produce compounding errors when the learner acts on its own.', topics: ['motivation', 'errors'] },
  { id: 'preliminaries', title: '2. Preliminaries', page: 2, summary: 'Defines policies, state distributions, surrogate loss, and task cost. Contrasts standard imitation learning with forward training and stochastic policy mixtures.', topics: ['notation', 'objective'] },
  { id: 'dagger', title: '3. DAgger', page: 3, summary: 'Iteratively collect expert labels on states reached during learner rollouts, aggregate the data, and train a new policy. Optional expert mixing can help early exploration.', topics: ['algorithm', 'aggregation', 'expert'] },
  { id: 'theory', title: '4. Theoretical analysis', page: 4, summary: 'Relates imitation learning to no-regret online learning. Performance bounds depend on learning assumptions, expert mixing, and whether the analysis uses true or sampled losses.', topics: ['assumptions', 'no-regret', 'limits'] },
  { id: 'experiments', title: '5. Experiments', page: 6, summary: 'Tests Super Tux Kart, Super Mario Bros., and handwriting recognition. The experiments illustrate how collecting learner-induced states can improve on expert-only training.', topics: ['mario', 'ocr'] },
  { id: 'future', title: '6. Future work', page: 8, summary: 'Suggests richer decoding methods and connections to planning and reinforcement learning.', topics: ['future'] },
  { id: 'references', title: 'References', page: 9, summary: 'Prior work on imitation learning, structured prediction, and online learning.', topics: [] },
];
// Heading positions verified in the source, so navigation lands at the section rather than the page top.
const headingRuns = [40, 56, 540, 559, 260, 152, 1];
sections.forEach((section, i) => { section.y = extracted.pages[section.page - 1].lines[headingRuns[i]].rect.y; });
// Small geometry-backed chunks let the teacher retrieve beyond the curated highlights.
const passages = extracted.pages.flatMap(p => {
  const result = [];
  for (let i = 0; i < p.lines.length; i += 30) {
    const lines = p.lines.slice(i, i + 30);
    result.push({ id: `p${p.page}-${i}`, page: p.page, quote: cleanText(lines), rects: lines.map(l => l.rect).filter(validRect) });
  }
  return result;
});
export const daggerBundle = {
  version: 1, paperId: 'ai-dagger', fingerprint: extracted.fingerprint, pageCount: extracted.pages.length,
  pageSizes: extracted.pages.map(p => ({ width: p.width, height: p.height })),
  title: 'DAgger', subtitle: 'A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning',
  authors: 'Stéphane Ross · Geoffrey J. Gordon · J. Andrew Bagnell', year: 'AISTATS 2011',
  overview: 'Learn from the situations you actually encounter. DAgger repeatedly lets a learner act, asks an expert what it should have done, and adds those examples to its training data.',
  ideas: [
    { title: 'The problem', text: 'Good predictions on expert demonstrations do not ensure good behavior when your own mistakes change the states you visit.', citation: 'errors' },
    { title: 'The contribution', text: 'A simple data-aggregation algorithm connects imitation learning to no-regret online learning.', citation: 'aggregation' },
    { title: 'The evidence', text: 'Game-playing and handwriting experiments show benefits from learning on learner-induced states. The guarantees require explicit assumptions.', citation: 'ocr' },
  ],
  guidance: [
    'Start with the introduction, then Algorithm 3.1 on PDF page 4. Read the Mario example on page 7 to make the motivation concrete.',
    'Prerequisites: supervised learning, a policy as a rule for choosing actions, and an expectation as an average under a distribution.',
    'The dense part is the theory. Distinguish surrogate loss from task cost, and average regret from prediction error. Check assumptions before interpreting a bound.',
  ],
  findings: [
    { title: 'Learning to recover', text: 'The Mario example explains why more expert-only data can fail: the learner gets stuck in states that the expert usually avoids. Iterative methods learn from those situations.', citation: 'mario' },
    { title: 'A measurable OCR improvement', text: 'Character accuracy reaches 85.5% with DAgger, compared with 83.6% for the supervised structured baseline and 82% without structure, in the reported handwriting experiment.', citation: 'ocr' },
  ],
  limitations: [
    { title: 'The guarantees have conditions', text: 'The theory requires a no-regret learner or strongly convex surrogate loss. Finite-sample guarantees and arbitrary task costs need additional care.', citation: 'limits' },
    { title: 'Expert feedback is still needed', text: 'Visited states require expert action labels. Optional expert control during rollout does not remove that labeling requirement.', citation: 'expert' },
  ],
  sections, highlights, passages: [...highlights, ...passages],
};
