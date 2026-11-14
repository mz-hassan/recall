import React from 'react';

export function ReadingPage({ course, lecture }) {
  const readings = lecture.readings ?? [];
  return <>
    <a className="back" href={'#lecture/' + course.id + '/' + lecture.id}>← {lecture.title}</a>
    <div className="eyebrow">{course.code} · LECTURE {lecture.id.padStart(2, '0')}</div>
    <h1>Reading breakdowns<em>.</em></h1>
    <p className="intro">Plain-language explanations, annotated equations, and visual walkthroughs will appear here as they’re generated.</p>
    <div className="source-list" style={{ marginTop: 24 }}>
      {readings.map(reading => <article className="source-row" key={reading.title}>
        <div className="source-body"><h3>{reading.title}</h3><p>{reading.kind} · Breakdown pending</p></div>
        <div className="source-actions">{reading.source_url && <a href={reading.source_url} target="_blank" rel="noreferrer">Original ↗</a>}</div>
      </article>)}
      {!readings.length && <div className="empty-state">No assigned readings in the dataset for this lecture.</div>}
    </div>
  </>;
}
