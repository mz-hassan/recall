import React from 'react';
import { sourcePath } from '../api.js';
export function SourceReferences({ courseId, references }) {
  return <ul className="cg-references">{references.map((ref, index) => <li key={`${ref.sourceId}-${ref.start}-${index}`}>
    <a className="cg-source" href={sourcePath(courseId, ref)} target="_blank" rel="noopener noreferrer">{ref.title} ↗</a>
    <blockquote>{ref.quote}</blockquote>
    <div className="cg-source-links"><a href={`#lecture/${courseId}/${ref.lectureId}`}>Lecture {ref.lectureId} ↗</a>
      {ref.url && <a href={ref.page ? ref.url.split('#')[0] + '#page=' + ref.page : ref.url} target="_blank" rel="noopener noreferrer">Original source ↗</a>}</div>
  </li>)}</ul>;
}
