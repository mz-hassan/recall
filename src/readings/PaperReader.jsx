import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { papersForCourse, paperPath } from './catalog.js';
import { daggerBundle } from './data/dagger.js';
import { initialReader, readerReducer, saveReader } from './state.js';
import { askTeacher, generateReading } from './api.js';
import { PdfReader } from './components/PdfReader.jsx';
import PaperOutline from './components/PaperOutline.jsx';
import TeacherPanel from './components/TeacherPanel.jsx';
import SelectionPopup from './components/SelectionPopup.jsx';
import { PanelRail, ResizeHandle } from './components/ReaderPanel.jsx';
import './readings.css';

export function PaperReader({ course, paperId, anchorId }) {
  const paper = papersForCourse(course.id).find(p => p.id === paperId);
  if (!paper) return <div className="empty-state">Paper not found. <a href={`#papers/${course.id}`}>Back to Papers</a></div>;
  return paper.prepared ? <Reader key={paper.id} course={course} paper={paper} bundle={daggerBundle} anchorId={anchorId}/> : <GeneratedReader key={paper.id} course={course} paper={paper} anchorId={anchorId}/>;
}

function GeneratedReader({ course, paper, anchorId }) {
  const [bundle, setBundle] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    generateReading(paper.id, controller.signal).then(setBundle).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [paper.id, attempt]);
  if (bundle) return <Reader course={course} paper={{ ...paper, pdfUrl: `/api/readings/${paper.id}/pdf` }} bundle={bundle} anchorId={anchorId}/>;
  return <div className="reading-generation"><a className="back" href={`#papers/${course.id}`}>← {course.name} / Papers</a><h1>{paper.title}</h1>{error ? <div className="reading-alert" role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>Retry generation</button></div> : <div className="generation-loading" role="status"><p>Reading the paper and preparing your guide… This may take a little while.</p><progress aria-label="Preparing paper guide"/></div>}<a className="secondary" href={paper.originalUrl} target="_blank" rel="noreferrer">Open original ↗</a></div>;
}

function Reader({ course, paper, bundle, anchorId }) {
  const [state, dispatch] = useReducer(readerReducer, null, () => initialReader(paper.id, bundle.fingerprint));
  const [navigation, setNavigation] = useState(null), [paperOpen, setPaperOpen] = useState(false), [paperLoaded, setPaperLoaded] = useState(false);
  const [paperWidth, setPaperWidth] = useState(500), [chatWidth, setChatWidth] = useState(360), [paperFullscreen, setPaperFullscreen] = useState(false);
  const [selection, setSelection] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(null), latest = useRef(state), teacherToggle = useRef(null), paperToggle = useRef(null), retry = useRef(null);
  const dismissSelection = useCallback(() => setSelection(null), []);
  latest.current = state;
  useEffect(() => { saveReader(paper.id, state); }, [paper.id, state]);
  useEffect(() => () => { pending.current?.abort(); saveReader(paper.id, latest.current); }, [paper.id]);
  useEffect(() => { if (anchorId) navigate(anchorId, false); }, [anchorId]);

  function openPaper() { setPaperLoaded(true); setPaperOpen(true); }
  function closePaper() { setPaperOpen(false); setPaperFullscreen(false); paperToggle.current?.focus({ preventScroll: true }); }
  function openTeacher() { dispatch({ type: 'teacher', open: true }); }
  function closeTeacher() { dispatch({ type: 'teacher', open: false }); teacherToggle.current?.focus({ preventScroll: true }); }
  function showSource(page, y = 0) {
    setNavigation({ page, y, nonce: Date.now() });
    dispatch({ type: 'page', page });
    openPaper();
    dismissSelection();
    if (window.innerWidth < 1050) dispatch({ type: 'teacher', open: false });
  }
  function navigate(id, updateHash = true) {
    const passage = bundle.passages.find(p => p.id === id);
    if (!passage) return;
    dispatch({ type: 'select', context: { page: passage.page, passageId: passage.id, quote: passage.quote, title: passage.title || 'Source passage' } });
    showSource(passage.page, passage.rects[0]?.y || 0);
    if (updateHash) window.history.replaceState(null, '', `${paperPath(paper)}/${id}`);
  }
  function select(context, bounds) {
    dispatch({ type: 'select', context });
    setSelection({ context, bounds: { left: bounds.left, bottom: bounds.bottom } });
  }
  function explain(context) {
    const passage = bundle.passages.find(p => p.id === context.passageId);
    showSource(context.page, context.regions?.[0]?.y ?? passage?.rects[0]?.y ?? 0);
    openTeacher();
    window.getSelection()?.removeAllRanges();
    send('Help me understand this passage in the context of the paper.', undefined, context);
  }
  async function send(text, existing, selectedContext = state.context) {
    if (pending.current || !text.trim()) return;
    const input = existing || {
      requestId: crypto.randomUUID(), question: text,
      context: selectedContext ? { page: selectedContext.page, endPage: selectedContext.endPage, passageId: selectedContext.passageId, quote: selectedContext.quote } : null,
      history: state.messages.slice(-10).map(m => ({ role: m.role, content: m.text.slice(0, 6000) })),
    };
    const controller = new AbortController(); pending.current = controller; retry.current = input;
    setBusy(true); setError('');
    if (!existing) dispatch({ type: 'message', message: { id: input.requestId, role: 'user', text, context: structuredClone(selectedContext) } });
    try {
      const result = await askTeacher(paper.id, input, controller.signal);
      if (controller.signal.aborted || result.requestId !== input.requestId) return;
      const known = new Set(bundle.passages.map(p => p.id));
      if (result.blocks.some(b => b.citations.some(id => !known.has(id))) || result.annotations.some(a => !known.has(a.passageId)) || result.diagrams.some(d => d.nodes.some(n => !known.has(n.passageId)))) throw new Error('The teacher returned an unknown source. Please retry.');
      const messageId = `${input.requestId}-answer`;
      dispatch({ type: 'result', message: { id: messageId, role: 'assistant', text: result.blocks.map(b => b.text).join('\n\n'), blocks: result.blocks }, annotations: result.annotations.map((a, i) => ({ ...a, id: `${input.requestId}-annotation-${i}` })), diagrams: result.diagrams.map((d, i) => ({ ...d, messageId, id: `${input.requestId}-diagram-${i}` })) });
      retry.current = null;
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  const temporary = state.annotations.map(a => ({ ...bundle.passages.find(p => p.id === a.passageId), ...a, temporary: true }));
  return <section className="reading-workspace">
    <div className="reading-heading"><div><a className="back" href={`#papers/${course.id}`}>← {course.name} / Papers</a><div className="reading-title"><h1>{paper.shortTitle}<span className="reading-dot">.</span></h1><span className="reading-edition">{bundle.year} · {bundle.pageCount} pages</span></div><p>{bundle.subtitle}</p><small>{bundle.authors}</small></div><a className="secondary" href={paper.originalUrl} target="_blank" rel="noreferrer">Original paper ↗</a></div>
    <div className="reading-toolbar">
      <button ref={paperToggle} className={paperOpen ? 'active' : ''} aria-expanded={paperOpen} onClick={() => paperOpen ? closePaper() : openPaper()}>▤ {paperOpen ? 'Hide PDF' : 'Read the PDF'}</button>
      <span className="reading-toolbar-label">Paper outline</span>
      <button ref={teacherToggle} className={state.teacherOpen ? 'active' : ''} aria-expanded={state.teacherOpen} onClick={() => state.teacherOpen ? closeTeacher() : openTeacher()}>✧ {state.teacherOpen ? 'Hide chat' : 'Ask about this paper'}</button>
    </div>
    <div className="reading-layout">
      {!paperOpen && <PanelRail side="left" onOpen={openPaper} pages={bundle.pageCount}/>}
      {paperLoaded && <aside className={`reading-paper ${paperFullscreen ? 'paper-fullscreen' : ''}`} hidden={!paperOpen} aria-label="Original PDF" style={{ '--panel-width': `${paperWidth}px` }} onKeyDown={event => { if (event.key === 'Escape') { if (paperFullscreen) setPaperFullscreen(false); else closePaper(); } }}>
        <div className="reading-panel-heading"><div><span>ORIGINAL PAPER</span><small>Read alongside the outline</small></div><div className="panel-actions"><button aria-label={paperFullscreen ? 'Reduce paper panel' : 'Expand paper panel'} onClick={() => setPaperFullscreen(!paperFullscreen)}>{paperFullscreen ? '↙' : '↗'}</button><button aria-label="Close paper" onClick={closePaper}>×</button></div></div>
        <div className="paper-navigation"><label>Page <input aria-label="Page number" type="number" min="1" max={bundle.pageCount} value={state.page} onChange={event => { const page = Number(event.target.value); if (page >= 1 && page <= bundle.pageCount) showSource(page); }}/> / {bundle.pageCount}</label><button aria-pressed={state.showHighlights} onClick={() => dispatch({ type: 'highlights' })}>{state.showHighlights ? '◉' : '○'} Highlights</button></div>
        <PdfReader paper={paper} bundle={bundle} annotations={[...bundle.highlights, ...temporary]} showHighlights={state.showHighlights} onSelect={select} onPage={page => dispatch({ type: 'page', page })} navigation={navigation} initialPage={state.page}/>
        <ResizeHandle side="left" width={paperWidth} onResize={setPaperWidth}/>
      </aside>}
      <PaperOutline bundle={bundle} onNavigate={navigate} onSection={section => { dispatch({ type: 'select', context: { page: section.page, title: section.title, quote: section.summary } }); showSource(section.page, section.y); }} onSelect={select}/>
      <TeacherPanel state={state} bundle={bundle} open={state.teacherOpen} width={chatWidth} onResize={setChatWidth} onClose={closeTeacher} onNavigate={navigate} onDetach={() => dispatch({ type: 'select', context: null })} onRemove={id => dispatch({ type: 'remove', id })} onClear={() => dispatch({ type: 'clear' })} busy={busy} error={error} onSend={send} onRetry={() => retry.current && send(retry.current.question, retry.current)} onCancel={() => { pending.current?.abort(); pending.current = null; setBusy(false); }}/>
      {!state.teacherOpen && <PanelRail side="right" onOpen={openTeacher}/>}
    </div>
    {selection && <SelectionPopup selection={selection} onExplain={explain} onDismiss={dismissSelection}/>}
  </section>;
}
