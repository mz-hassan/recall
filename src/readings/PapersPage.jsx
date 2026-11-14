import React, { useState } from 'react';
import { papersForCourse, paperPath } from './catalog.js';
import './readings.css';
export function PapersPage({ course, lecture }) {
  const [query, setQuery] = useState('');
  const papers = papersForCourse(course.id).filter(p => (!lecture || p.assignments.some(a => a.lectureId === lecture.id)) && p.title.toLowerCase().includes(query.toLowerCase()));
  return <section className="papers-page">
    <div className="papers-intro"><div><div className="eyebrow">READ AT YOUR OWN PACE</div><h2>Papers, with a little perspective.</h2><p>Find the main idea. Follow the evidence. Ask about the parts that don’t click.</p></div><label className="papers-search">Find a paper<input aria-label="Find a paper" placeholder="Search titles…" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
    {lecture && <p className="papers-filter">Assigned to Lecture {lecture.id} · <a href={`#papers/${course.id}`}>See all course papers</a></p>}
    <div className="papers-grid">{papers.map(p => <article className={'paper-card' + (p.prepared ? ' prepared' : '')} key={p.id}>
      <div className="paper-card-top"><span>{p.assignments.some(a => a.kind === 'required') ? 'Required' : 'Optional'}</span><span>{p.prepared ? '● Reader ready' : 'Generate on open'}</span></div>
      <h3>{p.prepared ? <a href={paperPath(p)}>DAgger</a> : p.title}</h3>
      {p.prepared ? <><p className="paper-subtitle">{p.title}</p><p>Why learning from perfect demonstrations isn’t enough—and how collecting your own mistakes helps.</p><div className="paper-tags"><span>Imitation learning</span><span>9 pages</span><span>13 highlights</span></div></> : <p>Generate a reading guide when you open this paper.</p>}
      <div className="paper-card-bottom"><a className="primary" href={paperPath(p)}>Read & explore ↗</a><small>{p.assignments.length} assignment{p.assignments.length === 1 ? '' : 's'}</small></div>
    </article>)}</div>
    {!papers.length && <div className="empty-state">{query ? 'No papers match your search.' : 'No assigned papers in this course yet.'}</div>}
  </section>;
}
