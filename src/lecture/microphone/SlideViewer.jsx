import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Equation } from '../components/Equation.jsx';
import { SlideCoaching } from '../../../shared/contracts/slideCoaching.ts';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
const pdfUrl = '/api/datasets/cs50/lecture0/lecture0.pdf';

export function SlideViewer({ moment, runId }) {
  const host = useRef(null);
  const [width, setWidth] = useState(600);
  const [page, setPage] = useState(1);
  const [follow, setFollow] = useState(true);
  const [coaching, setCoaching] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(-1);
  const [animate, setAnimate] = useState(false);
  const [tableRows, setTableRows] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [verified, setVerified] = useState(false);
  const fingerprint = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  // Freeze the reference to a completed topic; open topics refresh at most every 30 seconds.
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const topicId = moment?.id;
  const readyRevision = moment?.status === 'closed' ? moment.revision : tick;
  useEffect(() => {
    setCoaching(null); setVerified(false); setStep(-1); setAnimate(false); setTableRows(null);
    if (!topicId || !runId) return;
    const cancellation = new AbortController();
    setPending(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/lectures/cs50/0/slide-coaching', { method: 'POST',
          headers: { 'content-type': 'application/json' }, signal: cancellation.signal,
          body: JSON.stringify({ runId, momentId: topicId, ...(!follow && { page }) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Slide notes are unavailable.');
        const value = SlideCoaching.parse(data);
        if (cancellation.signal.aborted) return;
        setCoaching(value); setVerified(fingerprint.current === value.fingerprint);
        if (follow) setPage(value.page);
      } catch (failure) { if (!cancellation.signal.aborted) setError(failure.message); }
      finally { if (!cancellation.signal.aborted) setPending(false); }
    }, 800);
    return () => { clearTimeout(timer); cancellation.abort(); };
  }, [topicId, readyRevision, runId, follow, follow ? null : page, attempt]);
  useEffect(() => {
    if (!animate || !coaching) return;
    const timer = setInterval(() => setStep(value => {
      setTableRows(rows => rows === null ? 1 : rows + 1);
      if (value >= coaching.spec.steps.length - 1) { setAnimate(false); return value; }
      return value + 1;
    }), 2600);
    return () => clearInterval(timer);
  }, [animate, coaching]);
  const spec = coaching?.page === page ? coaching.spec : null;
  const activeIds = step >= 0 ? spec?.steps[step]?.textIds ?? [] : spec?.highlights.map(item => item.textId) ?? [];
  const shownRows = tableRows === null ? spec?.table?.rows.length ?? 0 : Math.min(spec?.table?.rows.length ?? 0, tableRows);
  function go(next) { setFollow(false); setPage(Math.max(1, Math.min(159, next))); }
  return <section className="pilot-slides" aria-label="Lecture slide viewer">
    <div className="pilot-section-heading"><h2>Lecture slides</h2><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)}/> Follow topic</label></div>
    <div className="pilot-page-controls"><button disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
      <label>Page <input aria-label="Slide page" type="number" min="1" max="159" value={page} onChange={event => { const number = Number(event.target.value); if (Number.isInteger(number) && number >= 1 && number <= 159) go(number); }}/> / 159</label>
      <button disabled={page >= 159} onClick={() => go(page + 1)}>Next</button><a href={pdfUrl + '#page=' + page} target="_blank" rel="noreferrer">Original PDF ↗</a></div>
    <div ref={host} className={'pilot-pdf-host' + (verified && spec?.mode === 'whole' ? ' whole-slide' : '')}>
      <Document file={pdfUrl} onLoadSuccess={async () => {
        try { const bytes = await (await fetch(pdfUrl)).arrayBuffer();
          fingerprint.current = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
          setVerified(!coaching || fingerprint.current === coaching.fingerprint);
        } catch { setVerified(false); }
      }} onLoadError={() => setPdfError('The slide PDF could not load. Open the original PDF or retry.')} loading={<p>Loading the official slide PDF…</p>}>
        <Page pageNumber={page} width={width} renderAnnotationLayer={false} renderTextLayer={false}/>
      </Document>
      {verified && spec?.mode === 'highlight' && coaching.runs.filter(run => activeIds.includes(run.id)).map(run =>
        <span key={run.id} className="pilot-highlight" title={spec.highlights.find(item => item.textId === run.id)?.note || run.text}
          style={{ left: run.rect.x * 100 + '%', top: run.rect.y * 100 + '%', width: run.rect.width * 100 + '%', height: run.rect.height * 100 + '%' }}/>) }
    </div>
    {pdfError && <p role="alert">{pdfError}</p>}
    {coaching && !verified && <p>Checking PDF identity… Highlights appear only when the document matches.</p>}
    <div className="pilot-coaching" aria-live="polite">
      {pending && <p role="status">Matching this topic to the slides and preparing short notes…</p>}
      {error && <p role="status">{error} <button onClick={() => setAttempt(value => value + 1)}>Retry slide notes</button></p>}
      {spec && <><small>GENERATED SLIDE NOTES · {follow ? 'SUGGESTED MATCH' : 'SELECTED PAGE'} · {spec.mode === 'whole' ? 'WHOLE SLIDE' : 'TEXT HIGHLIGHTS'}</small><p>{spec.note}</p>
        {!!spec.steps.length && <><div className="pilot-step-controls"><button onClick={() => { setStep(0); setTableRows(1); setAnimate(true); }}>Animate explanation</button><button disabled={step < 0} onClick={() => setAnimate(false)}>Pause</button>
          <button disabled={step >= spec.steps.length - 1} onClick={() => { setAnimate(false); setStep(value => value + 1); setTableRows(rows => rows === null ? 1 : rows + 1); }}>Next step</button><button onClick={() => { setStep(-1); setTableRows(null); setAnimate(false); }}>Show all</button></div>
          <p>{step >= 0 ? `${step + 1}/${spec.steps.length}: ${spec.steps[step].note}` : 'Play the steps to follow the explanation on the slide.'}</p></>}
        {spec.table && <div className="pilot-table"><h3>{spec.table.title}</h3><small>{spec.table.basis === 'illustrative' ? 'ILLUSTRATIVE EXAMPLE' : 'BASED ON SLIDE / TRANSCRIPT'}</small>
          <table><thead><tr>{spec.table.columns.map((column, i) => <th key={i}>{column}</th>)}</tr></thead><tbody>{spec.table.rows.slice(0, shownRows).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>
          <button onClick={() => { setAnimate(false); setTableRows(1); }}>Fill table step by step</button>
          {shownRows < spec.table.rows.length && <button onClick={() => { setAnimate(false); setTableRows(rows => (rows ?? 0) + 1); }}>Fill next row</button>}</div>}
        {!!coaching.readings.length && <details><summary>Related lecture notes</summary>{coaching.readings.map((reading, index) => <blockquote key={index}><p>{reading.excerpt}</p><a href={reading.url} target="_blank" rel="noreferrer">{reading.title} ↗</a></blockquote>)}</details>}
        {spec.equations.map((equation, i) => <Equation key={i} {...equation}/>)}</>}
      {!topicId && <p>Start listening to match speech to the deck. You can browse every slide now.</p>}
    </div>
  </section>;
}
