export const relationLabel = relation => relation.replaceAll('_', ' ');
export function filterGraph(graph, { lecture = '', relation = '', search = '', selected = '', neighborsOnly = false }) {
  let nodes = graph.nodes.filter(node => !lecture || node.lectureIds.includes(lecture));
  const availableIds = new Set(nodes.map(node => node.id));
  let edges = graph.edges.filter(edge => (!lecture || edge.lectureIds.includes(lecture)) && (!relation || edge.relation === relation) && availableIds.has(edge.from) && availableIds.has(edge.to));
  if (relation) {
    const endpoints = new Set(edges.flatMap(edge => [edge.from, edge.to]));
    nodes = nodes.filter(node => endpoints.has(node.id));
  }
  const query = search.trim().toLowerCase();
  if (query || (neighborsOnly && selected)) {
    const matches = new Set(nodes.filter(node => neighborsOnly && selected ? node.id === selected : [node.label, ...node.aliases].some(value => value.toLowerCase().includes(query))).map(node => node.id));
    const neighborhood = new Set(matches);
    for (const edge of edges) if (matches.has(edge.from) || matches.has(edge.to)) { neighborhood.add(edge.from); neighborhood.add(edge.to); }
    nodes = nodes.filter(node => neighborhood.has(node.id));
  }
  const ids = new Set(nodes.map(node => node.id));
  edges = edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
  return { nodes, edges };
}
