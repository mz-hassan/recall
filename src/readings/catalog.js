import manifest from '../../datasets/cs690s/manifest.json' with { type: 'json' };

function sourceId(url) {
  let hash = 2166136261;
  for (const c of url) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

export function makePaperCatalog(courseId, lectures) {
  const papers = new Map();
  for (const lecture of lectures) for (const kind of ['required', 'optional']) for (const source of lecture[kind] ?? []) {
    const key = source.source_url || source.files?.[0] || source.title;
    const dagger = key === 'https://proceedings.mlr.press/v15/ross11a/ross11a.pdf';
    const paper = papers.get(key) ?? {
      id: `${courseId}-${dagger ? 'dagger' : sourceId(key)}`, courseId,
      title: source.title, shortTitle: dagger ? 'DAgger' : source.title,
      originalUrl: source.source_url, pdfUrl: dagger ? 'pdfs/ai-02-reading.pdf' : null,
      files: source.files || [],
      prepared: dagger, assignments: [],
    };
    paper.assignments.push({ lectureId: String(lecture.number), kind });
    papers.set(key, paper);
  }
  return [...papers.values()].sort((a, b) => Number(b.prepared) - Number(a.prepared));
}
export const papers = makePaperCatalog('ai', manifest.lectures);
export const papersForCourse = courseId => papers.filter(p => p.courseId === courseId);
export const paperPath = paper => `#paper/${paper.courseId}/${paper.id}`;
