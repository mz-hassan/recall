import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { ResizeHandle } from './ReaderPanel.jsx';
const TeachingDiagram = lazy(() => import('./TeachingDiagram.jsx'));

export default function TeacherPanel({ state, bundle, open, width, onResize, onClose, onNavigate, onDetach, onRemove, onClear, busy, error, onCancel, onRetry, onSend }) {
  const [question, setQuestion] = React.useState('');
  const [fullscreen, setFullscreen] = React.useState(false);
  const input = useRef(null), messages = useRef(null);
  useEffect(() => { if (!open) setFullscreen(false); }, [open]);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => { messages.current?.scrollTo({ top: messages.current.scrollHeight, behavior: 'smooth' }); }, [state.messages.length, busy]);
  const navigate = id => { setFullscreen(false); onNavigate(id); };
  const diagram = d => <TeachingDiagram key={d.id} diagram={d} onNavigate={navigate} onRemove={() => onRemove(d.id)}/>;
  return <aside className={`reading-teacher ${fullscreen ? 'teacher-fullscreen' : ''}`} hidden={!open} style={{ '--panel-width': `${width}px` }} aria-label="Paper chat" onKeyDown={event => { if (event.key === 'Escape') { if (fullscreen) setFullscreen(false); else onClose(); } }}>
    <ResizeHandle side="right" width={width} onResize={onResize}/>
    <div className="reading-panel-heading"><div><span>✧ PAPER CHAT</span><small>Think it through together</small></div><div className="panel-actions"><button aria-label={fullscreen ? 'Reduce chat panel' : 'Expand chat panel'} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? '↙' : '↗'}</button><button aria-label="Close chat" onClick={onClose}>×</button></div></div>
    <div className="teacher-conversation" ref={messages}>
      {!state.messages.length && <div className="teacher-empty"><span aria-hidden="true">✧</span><h2>What would you like to untangle?</h2><p>Ask about a concept, a result, or how the pieces connect. I’ll add a diagram when it helps.</p></div>}
      <div className="teacher-messages" aria-live="polite">{state.messages.map(message => <article className={`teacher-message ${message.role}`} key={message.id}>
        <small>{message.role === 'user' ? 'YOU' : 'TEACHER'}{message.context ? ` · p. ${message.context.page}` : ''}</small>
        {message.blocks ? message.blocks.map((block, index) => <div key={index}><p>{block.text}</p><div className="teacher-citations">{block.citations.map(id => <button key={id} onClick={() => navigate(id)}>p. {bundle.passages.find(p => p.id === id)?.page} ↗</button>)}</div></div>) : <p>{message.text}</p>}
        <Suspense fallback={<p>Drawing the explanation…</p>}>{state.diagrams.filter(d => d.messageId === message.id).map(diagram)}</Suspense>
      </article>)}</div>
      <Suspense fallback={<p>Drawing the explanation…</p>}>{state.diagrams.filter(d => !d.messageId).map(diagram)}</Suspense>
      {state.annotations.length > 0 && <details className="teacher-notes"><summary>Highlights added to the paper ({state.annotations.length})</summary>{state.annotations.map(annotation => <div key={annotation.id}><button onClick={() => navigate(annotation.passageId)}>{annotation.explanation}</button><button aria-label="Remove annotation" onClick={() => onRemove(annotation.id)}>×</button></div>)}</details>}
      {(state.annotations.length > 0 || state.diagrams.length > 0) && <button className="reading-source" onClick={onClear}>Clear teaching aids</button>}
      {busy && <div className="teacher-working" role="status">Thinking it through… <button onClick={onCancel}>Cancel</button></div>}
      {error && <div className="reading-alert" role="alert">{error}<button disabled={busy} onClick={onRetry}>Retry</button></div>}
    </div>
    <form className="teacher-composer" onSubmit={event => { event.preventDefault(); if (question.trim() && !busy) { onSend(question); setQuestion(''); } }}>
      {state.context && <div className="teacher-context"><div><small>{state.context.title || 'Attached passage'} · p. {state.context.page}</small><button aria-label="Detach passage" onClick={onDetach} type="button">×</button></div><p>{state.context.quote}</p></div>}
      <label htmlFor="teacher-question">Message the paper teacher</label>
      <textarea id="teacher-question" ref={input} value={question} maxLength={3000} placeholder="What’s confusing?" onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }}/>
      <div className="teacher-send"><small>{state.context ? 'Selected passage attached' : 'This paper is in context'}</small><button className="primary" disabled={busy || !question.trim()}>Send ↗</button></div>
    </form>
  </aside>;
}
