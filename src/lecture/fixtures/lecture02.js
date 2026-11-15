import { lecture02Equations } from './lecture02Equations.js';
import { headlines, moments as curated, subtitles } from '../content.js';

const slidePages = { 7: [6, 7], 9: [8, 9], 13: [12, 13] };
const slidesFor = page => (slidePages[page] ?? [page]).map(number => ({
  page: number, url: 'assets/slide-' + String(number).padStart(2, '0') + '.png',
  equationNotes: lecture02Equations[number],
}));

export const demoMoments = curated.map((moment, index) => ({
  ...moment, id: 'ai/2/curated/' + index, headline: headlines[index], lede: subtitles[index], artIndex: index,
  slides: slidesFor(moment.slide),
  equations: [], artifacts: [], graph: null,
}));
demoMoments[5] = {
  ...demoMoments[5],
  artifacts: [{ id: 'dagger-paper', kind: 'reading', title: 'DAgger paper', url: 'pdfs/ai-02-reading.pdf' }],
  graph: { origin: 'fixture', nodes: [{ id: 'rollout', label: 'Policy rollout' }, { id: 'expert', label: 'Expert labels' }, { id: 'dataset', label: 'Aggregated dataset' }],
    edges: [{ id: 'query', from: 'rollout', to: 'expert', relation: 'queries' }, { id: 'append', from: 'expert', to: 'dataset', relation: 'adds to' }] },
};
