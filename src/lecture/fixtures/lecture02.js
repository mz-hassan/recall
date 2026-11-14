import { headlines, moments as curated, subtitles } from '../content.js';

export const demoMoments = curated.map((moment, index) => ({
  ...moment, id: 'ai/2/curated/' + index, headline: headlines[index], lede: subtitles[index], artIndex: index,
  slides: [{ page: moment.slide, url: 'assets/slide-' + String(moment.slide).padStart(2, '0') + '.png' }],
  equations: [], artifacts: [], graph: null,
}));
demoMoments[5] = {
  ...demoMoments[5],
  slides: [demoMoments[5].slides[0], { page: 8, url: 'assets/slide-08.png' }],
  equations: [{ expression: 'J(π) − J(π*) ≤ O(Tε)', explanation: 'Under the DAgger assumptions, excess cost scales with the horizon T and the learned policy error ε, with a constant depending on the cost of a mistake.' }],
  artifacts: [{ id: 'dagger-paper', kind: 'reading', title: 'DAgger paper', url: 'pdfs/ai-02-reading.pdf' }],
  graph: { origin: 'fixture', nodes: [{ id: 'rollout', label: 'Policy rollout' }, { id: 'expert', label: 'Expert labels' }, { id: 'dataset', label: 'Aggregated dataset' }],
    edges: [{ id: 'query', from: 'rollout', to: 'expert', relation: 'queries' }, { id: 'append', from: 'expert', to: 'dataset', relation: 'adds to' }] },
};
