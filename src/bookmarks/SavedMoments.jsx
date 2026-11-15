import React, { useEffect, useState } from 'react';
import { Dialog } from '../ui.jsx';
import { MomentDetail } from '../lecture/MomentDetail.jsx';
import { replayPath } from '../lecture/replay.js';
import { loadBookmark, loadBookmarks, setBookmark } from './api.js';
import { browserBookmarks } from './legacy.js';
import './bookmarks.css';

export function SavedMoments({ courses, enrolled }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [moment, setMoment] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(null);
  const [importMessage, setImportMessage] = useState('');
  const [older] = useState(browserBookmarks);
  const importable = rows ? older.filter(ref => enrolled.includes(ref.courseId) && !rows.some(row =>
    row.courseId === ref.courseId && row.lectureId === ref.lectureId && row.runId === ref.runId && row.momentId === ref.momentId)) : [];

  useEffect(() => {
    const abort = new AbortController();
    loadBookmarks({}, abort.signal).then(setRows).catch(problem => {
      if (!abort.signal.aborted) setError(problem.message);
    });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    loadBookmark(selected.id, abort.signal).then(setMoment).catch(problem => {
      if (!abort.signal.aborted) setError(problem.message);
    });
    return () => abort.abort();
  }, [selected]);

  function open(row) {
    setError('');
    setMoment(null);
    setPreview(null);
    setSelected(row);
  }

  async function remove(row) {
    setError('');
    setPending(row.id);
    try {
      await setBookmark(row, false);
      setRows(current => current.filter(item => item.id !== row.id));
    } catch (problem) {
      setError(problem.message);
    } finally {
      setPending(null);
    }
  }

  async function importBrowserBookmarks() {
    setPending('import');
    setError('');
    try {
      const results = await Promise.allSettled(importable.map(ref => setBookmark(ref, true)));
      setRows(await loadBookmarks({}));
      const count = results.filter(result => result.status === 'fulfilled').length;
      setImportMessage(count === results.length ? 'Browser bookmarks imported.'
        : `Imported ${count} of ${results.length}. Some bookmarks could not be matched to this account’s lectures.`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setPending(null);
    }
  }

  return <section className="saved-moments">
    <a className="back" href="#courses">← My courses</a>
    <div className="hero"><div><div className="eyebrow">YOUR WORKSPACE</div>
      <h1>Saved moments<em>.</em></h1>
      <p className="intro">Revisit the lecture topics you bookmarked.</p>
    </div></div>
    {importable.length > 0 && <p className="saved-moment-import">
      <button className="secondary" disabled={pending !== null} onClick={importBrowserBookmarks}>Import bookmarks from this browser</button>
    </p>}
    {importMessage && <p role="status">{importMessage}</p>}
    {error && !selected && <p className="message" role="alert">{error}</p>}
    {rows === null && !error && <p role="status">Loading saved moments…</p>}
    {rows?.length === 0 && <p className="empty-state">No saved moments yet. Open a lecture topic and choose Save this moment.</p>}
    {!!rows?.length && <ul className="saved-moment-list">
      {rows.map(row => <li key={row.id}>
        <button className="saved-moment-open" onClick={() => open(row)}>
          <small>{courses.find(course => course.id === row.courseId)?.name ?? row.courseId} · Lecture {row.lectureId.padStart(2, '0')} · {row.label}</small>
          <strong>{row.title}</strong>
          <span>{row.lectureTitle}</span>
        </button>
        <button className="secondary" aria-label={'Remove ' + row.title} disabled={pending !== null} onClick={() => remove(row)}>Remove</button>
      </li>)}
    </ul>}
    <Dialog wide onClose={() => { setSelected(null); setError(''); }}>
      {selected && <div className="staff-topic-detail saved-moment-detail">
        {error ? <p role="alert">{error}</p> : !moment ? <p role="status">Opening saved moment…</p> : <>
          <div className="saved-moment-links">
            {selected.runId === null
              ? <a className="source-link" href={replayPath(selected.lectureId, false, selected.courseId) + '&topic=' + encodeURIComponent(selected.momentId)}>Open in timeline ↗</a>
              : <a className="source-link" href={'#lecture/' + selected.courseId + '/' + selected.lectureId}>Lecture materials ↗</a>}
          </div>
          <MomentDetail moment={moment} onOpen={setPreview}/>
          {preview && <div className="saved-moment-source" ref={element => element?.scrollIntoView({ block: 'nearest' })}>
            {preview.slide ? <img src={preview.slide.url} alt={'Original slide ' + preview.slide.page}/> : <blockquote>{moment.quote}</blockquote>}
          </div>}
        </>}
      </div>}
    </Dialog>
  </section>;
}
