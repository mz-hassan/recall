import React from 'react';

export function ReadingPage({ course, lecture, source, materialPath, original }) {
  return <>
    <a className="back" href={materialPath}>← Course material</a>
    <div className="eyebrow">{course.code} · LECTURE {lecture.id.padStart(2, '0')} · READING BREAKDOWN</div>
    <h1>{source ? source.title : 'Reading unavailable'}<em>.</em></h1>
    {source ? <>
      <p className="intro">{source.kind} reading · {lecture.title}</p>
      <div className="reading-original">{original}</div>
      <p className="empty-state">A breakdown hasn’t been generated for this reading yet.</p>
    </> : <p className="intro">This reading is no longer listed in the lecture’s course material.</p>}
  </>;
}
