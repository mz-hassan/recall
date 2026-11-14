import { randomUUID } from 'node:crypto';
import { digest } from '../../data/dataset.ts';
import type { Completion, Concept, Edge, Graph, IndexedLecture, Reference } from '../../../../shared/contracts/graph.ts';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/behavioural|behavioral|behaviour/g, 'behavior').replace(/[^\p{L}\p{N}*^]+/gu, ' ').trim();
const unique = <T>(items: T[]) => [...new Set(items)];
const refs = (items: Reference[]) => [...new Map(items.map(ref => [JSON.stringify(ref), ref])).values()];

// Replace this lecture's contributions, retaining identities from the last published graph.
export function mergeLecture(previous: Graph, indexed: IndexedLecture, completion: Completion, contentHash: string, pipeline: string): Graph {
  const nodes = new Map<string, Concept>();
  const edges = new Map<string, Edge>();
  for (const node of previous.nodes) nodes.set(node.id, { ...node, aliases: [...node.aliases], references: node.references.filter(ref => ref.lectureId !== indexed.lectureId) });
  for (const edge of previous.edges) edges.set(edge.id, { ...edge, references: edge.references.filter(ref => ref.lectureId !== indexed.lectureId) });
  const aliases = new Map<string, Set<string>>();
  const keys = new Map<string, string>();
  const labels = new Map<string, string>();
  function register(node: Concept) {
    keys.set(normalize(node.id), node.id);
    labels.set(normalize(node.label), node.id);
    for (const value of [node.id, node.label, ...node.aliases]) {
      const key = normalize(value);
      if (!key) continue;
      const ids = aliases.get(key) ?? new Set<string>();
      ids.add(node.id); aliases.set(key, ids);
    }
  }
  nodes.forEach(register);
  function citations(items: { sourceId: string; quote: string }[]): Reference[] {
    return items.map(item => {
      const source = indexed.sources.find(source => source.id === item.sourceId);
      const start = source?.text.indexOf(item.quote) ?? -1;
      if (!source || start < 0) throw new Error('Citation source is unavailable.');
      return { sourceId: source.id, sourceHash: source.hash, lectureId: indexed.lectureId, quote: item.quote,
        start, end: start + item.quote.length, title: source.title, ...(source.path ? { path: source.path } : {}), ...(source.page ? { page: source.page } : {}), ...(source.url ? { url: source.url } : {}) };
    });
  }
  for (const extraction of indexed.extractions) {
    const mapping = new Map<string, string>();
    for (const concept of extraction.concepts) {
      // Canonical keys/labels take precedence over model-proposed aliases.
      // Shared or conflicting aliases do not justify merging distinct concepts.
      const exact = keys.get(normalize(concept.key)) ?? labels.get(normalize(concept.label));
      const candidates = new Set<string>();
      if (!exact) for (const value of [concept.key, concept.label, ...concept.aliases]) {
        const matches = aliases.get(normalize(value));
        if (matches?.size === 1) for (const id of matches) candidates.add(id);
      }
      const id = exact ?? (candidates.size === 1 ? [...candidates][0] : undefined) ?? `${completion.courseId}/concept/${digest(normalize(concept.label)).slice(0, 24)}`;
      const node = nodes.get(id) ?? { id, label: concept.label, aliases: [], lectureIds: [], references: [] };
      node.aliases = unique([...node.aliases, concept.label, concept.key, ...concept.aliases]);
      if (concept.summary) node.summary = concept.summary;
      node.references = refs([...node.references, ...citations(concept.citations)]);
      nodes.set(id, node); register(node); keys.set(normalize(concept.key), id); mapping.set(concept.key, id);
    }
    for (const relationship of extraction.edges) {
      const from = mapping.get(relationship.from), to = mapping.get(relationship.to);
      if (!from || !to) throw new Error('Unresolved relationship endpoint.');
      if (from === to) continue; // Aliases can legitimately collapse an extracted self-edge.
      const id = `${completion.courseId}/edge/${digest(`${from}|${relationship.relation}|${to}`).slice(0, 24)}`;
      const edge = edges.get(id) ?? { id, from, to, relation: relationship.relation, lectureIds: [], references: [] };
      edge.references = refs([...edge.references, ...citations(relationship.citations)]);
      edges.set(id, edge);
    }
  }
  const activeNodes = [...nodes.values()].filter(node => node.references.length);
  const ids = new Set(activeNodes.map(node => node.id));
  const activeEdges = [...edges.values()].filter(edge => edge.references.length && ids.has(edge.from) && ids.has(edge.to));
  for (const item of [...activeNodes, ...activeEdges]) item.lectureIds = unique(item.references.map(ref => ref.lectureId));
  const now = new Date().toISOString();
  return { version: randomUUID(), updatedAt: now, nodes: activeNodes, edges: activeEdges,
    lectures: [...previous.lectures.filter(item => item.id !== indexed.lectureId), {
      id: indexed.lectureId, title: indexed.title, revision: completion.revision, contentHash, pipeline, indexedAt: now,
    }].sort((a, b) => Number(a.id) - Number(b.id)),
    changes: { lectureId: indexed.lectureId,
      nodes: activeNodes.filter(node => !previous.nodes.some(old => old.id === node.id)).map(node => node.id),
      edges: activeEdges.filter(edge => !previous.edges.some(old => old.id === edge.id)).map(edge => edge.id),
    } };
}
