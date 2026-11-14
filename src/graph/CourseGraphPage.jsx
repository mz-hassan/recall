import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadGraph, retryIndexing } from './api.js';
import { filterGraph, relationLabel } from './filter.js';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { SourceReferences } from './components/SourceReferences.jsx';
import { indexingErrorMessage } from './errors.js';
import './graph.css';

export function CourseGraphPage({ course }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [lecture, setLecture] = useState('');
  const [relation, setRelation] = useState('');
  const [search, setSearch] = useState('');
  const [neighborsOnly, setNeighborsOnly] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState('');
  const detailPanel = useRef(null);
  useEffect(() => { detailPanel.current?.scrollTo({ top: 0 }); }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const next = await loadGraph(course.id, controller.signal);
        if (controller.signal.aborted) return;
        setData(old => old && JSON.stringify(old) === JSON.stringify(next) ? old : next);
        setError('');
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem.message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [course.id, refresh]);
  // Progress polling must not reset the graph layout or the user's pan/zoom.
  const published = useMemo(() => data ? { nodes: data.nodes, edges: data.edges } : { nodes: [], edges: [] }, [data?.version]);
  useEffect(() => {
    if (selected && !published.nodes.some(node => node.id === selected)) { setSelected(''); setNeighborsOnly(false); }
  }, [published, selected]);
  const changes = useMemo(() => data?.changes ?? { nodes: [], edges: [] }, [data?.version]);
  const visible = useMemo(() => filterGraph(published, { lecture, relation, search, selected, neighborsOnly }), [published, lecture, relation, search, neighborsOnly, neighborsOnly ? selected : '']);
  const node = published.nodes.find(item => item.id === selected);
  const connections = visible.edges.filter(edge => !selected || edge.from === selected || edge.to === selected);
  const labels = new Map(published.nodes.map(item => [item.id, item.label]));
  const pending = data?.jobs.filter(job => job.state === 'queued' || job.state === 'running') ?? [];
  // An older failed revision is superseded by a later successful/queued revision.
  const failures = data?.jobs.filter(job => job.state === 'failed' && !data.jobs.some(other => other.lectureId === job.lectureId && other.revision > job.revision)) ?? [];
  const recent = data?.lectures.find(item => item.id === changes.lectureId);
  async function retry(job) {
    setRetrying(job.id);
    try { await retryIndexing(job); setRefresh(value => value + 1); }
    catch (problem) { setError(problem.message); }
    finally { setRetrying(''); }
  }
  return <section className="cg-page">
    <a className="back" href={'#course/' + course.id}>← {course.name}</a>
    <div className="cg-heading"><div><div className="eyebrow">{course.code} · CONNECTED IDEAS</div><h1>Follow the <em>connections.</em></h1><p className="intro">The main ideas taught in each lecture, connected across your course. Select a topic for a short explanation and its connections.</p></div>
      <div className="cg-counts"><strong>{published.nodes.length}</strong> concepts <span>·</span> <strong>{published.edges.length}</strong> connections</div></div>
    {error && <div className="cg-notice cg-error" role="alert">{error} <button className="secondary" onClick={() => setRefresh(value => value + 1)}>Reconnect</button></div>}
    {!data && !error && <p className="cg-notice" role="status">Loading course graph…</p>}
    {data && !data.providerConfigured && <p className="cg-notice">Graph generation needs a DeepSeek API key configured on the server. Saved concepts remain available.</p>}
    <div aria-live="polite" aria-atomic="true" className="cg-status">
      {pending.length ? <p>Updating graph… {pending.length} lecture{pending.length === 1 ? '' : 's'} waiting or processing.</p> : recent ? <p>Updated from lecture {recent.id} · {changes.nodes.length} new concepts · {changes.edges.length} new connections{!changes.nodes.length && !changes.edges.length ? ' · Existing concepts and source references refreshed.' : ''}</p> : null}
    </div>
    {pending.map(job => <div className="cg-job" key={job.id}><span>{job.title} · {job.state === 'queued' ? 'Waiting' : job.total > 0 && job.progress === job.total - 1 ? 'Preparing concept summaries…' : job.total > 0 && job.progress === job.total - 2 ? 'Selecting the main lecture topics…' : `Processing lecture materials ${job.progress}/${job.total || '…'}`}</span><progress aria-label={'Indexing ' + job.title} value={job.progress} max={job.total || 1}/></div>)}
    {failures.map(job => <div className="cg-notice cg-error" key={job.id} role="alert"><div><strong>{job.title}: update failed</strong><p>{indexingErrorMessage(job.error)}</p><small>{published.nodes.length ? 'Your saved graph is unchanged.' : 'No graph has been published yet. Retry to finish indexing this lecture.'}</small></div><button className="secondary" disabled={retrying === job.id} onClick={() => retry(job)}>Retry update</button></div>)}
    {data && <>
      <div className="cg-toolbar">
        <label>Search concepts<input type="search" placeholder="Try behavior cloning or RL" value={search} onChange={event => setSearch(event.target.value)}/></label>
        <label>Lecture<select value={lecture} onChange={event => { setLecture(event.target.value); setSelected(''); }}><option value="">All indexed lectures</option>{data.lectures.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
        <label>Relationship<select value={relation} onChange={event => setRelation(event.target.value)}><option value="">All relationships</option>{[...new Set(published.edges.map(edge => edge.relation))].sort().map(value => <option key={value} value={value}>{relationLabel(value)}</option>)}</select></label>
        <button className="secondary" onClick={() => { setSearch(''); setLecture(''); setRelation(''); setSelected(''); setNeighborsOnly(false); }}>Reset</button>
      </div>
      {!published.nodes.length ? <div className="cg-empty"><span>✧</span><h2>Your graph starts with a completed lecture.</h2><p>Once a lecture’s transcript and slides are saved and its completion event arrives, its concepts will appear here automatically.</p><p>{data.lectures.length ? `${data.lectures.length} lectures processed; no supported concepts were extracted.` : 'No lectures have been indexed yet.'}</p></div> : <>
        <div className="cg-legend"><span><i/> Course concept</span><span><i className="cg-new-dot"/> New in latest update</span><span>{visible.nodes.length} concepts shown</span></div>
        <div className="cg-workspace"><div>
          <GraphCanvas graph={published} visibleGraph={visible} selected={selected} changes={changes} onSelect={setSelected}/>
          {!visible.nodes.length && <p className="cg-notice">No concepts match these filters.</p>}
        </div><aside className="cg-detail" aria-label="Selected concept" ref={detailPanel}>
          {node ? <><div className="eyebrow">SELECTED CONCEPT</div><h2>{node.label}</h2>
            <h3>Summary</h3><p className="cg-summary">{node.summary || 'A summary has not been generated for this concept yet.'}</p>
            <label className="cg-neighbors"><input type="checkbox" checked={neighborsOnly} onChange={event => setNeighborsOnly(event.target.checked)}/> Show only this concept and neighbors</label>
            <details className="cg-sources" key={node.id}><summary>Sources ({node.references.length})</summary><SourceReferences courseId={course.id} references={node.references}/></details>
            <p className="cg-aliases">Also known as: {node.aliases.filter(alias => alias !== node.label && !alias.includes('/concept/')).join(', ') || '—'}</p>
          </> : <><div className="eyebrow">EXPLORE A THREAD</div><h2>Ideas have a history.</h2><p>Select a concept to read a short summary and explore its neighboring ideas. Expand Sources whenever you want to inspect the lecture evidence.</p><p>You can also select any concept from the list below.</p></>}
        </aside></div>
        <div className="cg-lists"><section><h2>Concepts</h2><p className="cg-help">Search includes matching concepts and their immediate neighbors.</p><ul className="cg-concepts">{visible.nodes.map(item => <li key={item.id}><button type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.label}<small>{item.lectureIds.length} lecture{item.lectureIds.length === 1 ? '' : 's'}</small></button></li>)}</ul></section>
          <section><div className="cg-list-heading"><h2>{node ? `${node.label}: connections` : 'Connections'}</h2>{selected && <button onClick={() => { setSelected(''); setNeighborsOnly(false); }}>Show all</button>}</div>
            <ul className="cg-connections">{connections.map(edge => <li key={edge.id}><div><button onClick={() => setSelected(edge.from)}>{labels.get(edge.from)}</button><span> → {relationLabel(edge.relation)} → </span><button onClick={() => setSelected(edge.to)}>{labels.get(edge.to)}</button></div><details><summary>View supporting evidence</summary><SourceReferences courseId={course.id} references={edge.references}/></details></li>)}</ul>{!connections.length && <p className="cg-help">No connections in this view.</p>}</section></div>
      </>}
    </>}
  </section>;
}
