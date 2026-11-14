import type { Fixture } from '../../llm/fixture.ts';

type Passage = { id: string; page: number; quote: string };
const passagesOf = (evidence: Parameters<Fixture>[0]['evidence']) =>
  evidence.filter(item => item.kind === 'text' && item.id !== 'paper-overview' && item.id !== 'conversation');

/**
 * Offline stand-ins for the paper teacher and guide generator, used when LLM_PROVIDER=fixture.
 * Deterministic and clearly labelled: they quote the evidence they were given and do not teach.
 */
export const readingsFixtures: { teacher: Fixture; guide: Fixture } = {
  teacher: ({ evidence }) => {
    const first = passagesOf(evidence)[0];
    const quote = first?.kind === 'text' ? (JSON.parse(first.text) as Passage).quote.slice(0, 280) : '';
    return {
      blocks: [{ text: `Offline fixture answer. The most relevant passage says: ${quote}`, citations: [first?.id ?? 'missing'] }],
      annotations: [],
      diagrams: [],
    };
  },
  guide: ({ evidence }) => {
    const pages = evidence.filter(item => item.kind === 'text' && /^page-\d+$/.test(item.id));
    const sections = pages.slice(0, 5).map(item => ({
      title: `Page ${item.id.slice('page-'.length)}`,
      page: Number(item.id.slice('page-'.length)),
      summary: item.kind === 'text' ? item.text.slice(0, 200) : '',
    }));
    return { overview: 'Offline fixture guide: a page-by-page excerpt, not a summary.', sections, ideas: [], findings: [], limitations: [] };
  },
};
