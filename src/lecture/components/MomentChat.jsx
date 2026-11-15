import React, { useEffect, useRef, useState } from 'react';

export function MomentChat({ moment, client, runId, onClose, onSelectMoment }) {
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('moment');
  const [answer, setAnswer] = useState(null);
  const [answerContext, setAnswerContext] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef(null);
  const identity=useRef(null);
  const [history,setHistory]=useState([]);
  useEffect(()=>{
    if(!client?.chatHistory||!runId)return;
    const cancellation=new AbortController();
    client.chatHistory(runId,cancellation.signal).then(result=>{if(!cancellation.signal.aborted)setHistory(result.messages??[]);}).catch(()=>{});
    return()=>cancellation.abort();
  },[client,runId]);
  useEffect(() => {
    request.current?.abort();
    setPending(false);
    return () => request.current?.abort();
  }, [moment.id, runId]);

  async function submit(event) {
    event.preventDefault();
    if (!question.trim() || !client || !runId || pending) return;
    const cancellation = new AbortController();
    request.current?.abort();
    request.current = cancellation;
    setPending(true);
    setError('');
    const label = context === 'recent' ? 'Last 3 minutes' : moment.short;
    const fingerprint=JSON.stringify([runId,question.trim(),context,moment.id]);
    if(identity.current?.fingerprint!==fingerprint)identity.current={fingerprint,requestId:crypto.randomUUID()};
    try {
      const result = await client.chat({ requestId:identity.current.requestId,runId, question: question.trim(), context: context === 'recent'
        ? { kind: 'recent', seconds: 180 } : { kind: 'moment', momentId: moment.id } }, cancellation.signal);
      if (cancellation.signal.aborted) return;
      setAnswer(result);
      setAnswerContext(label);
      const id=identity.current.requestId;
      setHistory(previous=>previous.some(item=>item.request?.requestId===id)?previous:[...previous,{_id:id,request:{requestId:id,question:question.trim()},answer:result}]);
    } catch (failure) {
      if (!cancellation.signal.aborted) setError(failure.message);
    } finally {
      if (request.current === cancellation && !cancellation.signal.aborted) setPending(false);
    }
  }

  return <aside className="moment-chat" aria-label="Lecture side chat">
    <div className="eyebrow">SIDE CHAT <button type="button" onClick={onClose} aria-label="Close side chat">✕</button></div>
    <h2>Ask about this moment</h2>
    <p>{moment.short} · {moment.label}</p>
    {!client ? <p>Open a live simulation to ask questions using its transcript.</p> : <>
      <form onSubmit={submit}>
        <label>Context<select aria-label="Question context" value={context} onChange={event => setContext(event.target.value)} disabled={pending}>
          <option value="moment">This moment</option><option value="recent">Last 3 minutes</option>
        </select></label>
        <label className="lecture-chat-question">Your question<textarea aria-label="Ask a question about this topic" maxLength={2000} value={question}
          onChange={event => setQuestion(event.target.value)} placeholder="Ask a question about the lecture…" required/></label>
        <button className="lecture-chat-suggestion" type="button" disabled={pending} onClick={() => {
          setContext('recent'); setQuestion('What did I miss in the last 3 minutes?');
        }}>What did I miss?</button>
        <button className="lecture-chat-send" type="submit" disabled={pending || !question.trim() || !runId}>{pending ? 'Finding lecture context…' : error ? 'Retry question' : 'Send question'}</button>
      </form>
      {error && <p className="lecture-chat-error" role="alert">{error}</p>}
      {!!history.length&&<details className="lecture-chat-history"><summary>Saved questions ({history.length})</summary>{history.map(item=><details key={item._id}><summary>{item.request.question}</summary><p>{item.answer.answer}</p><nav aria-label="Saved answer sources">{item.answer.citations.map(citation=><button key={citation.momentId} onClick={()=>onSelectMoment(citation.momentId)}>{citation.label} · {citation.title} ↗</button>)}</nav></details>)}</details>}
      <div aria-live="polite">{answer && <section className="lecture-chat-answer" aria-label="Lecture answer">
        <small>{answerContext} · {answer.provider === 'fixture' ? 'Offline fixture answer' : answer.model}</small>
        <p className="lecture-chat-copy">{answer.answer}</p>
        <nav aria-label="Answer sources">{answer.citations.map(citation => <button key={citation.momentId} type="button"
          onClick={() => onSelectMoment(citation.momentId)}>{citation.label} · {citation.title} ↗</button>)}</nav>
        <p className="notes">{answer.range.timeSource === 'simulated' ? 'Times are simulated playback offsets.' : 'Times refer to the lecture recording.'}</p>
      </section>}</div>
    </>}
  </aside>;
}
