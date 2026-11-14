import React, { useEffect, useRef, useState } from 'react';
import { ArtifactVisual } from './ArtifactVisual.jsx';

function SavedArtifact({ reference, client, runId, momentId, onSelectMoment }) {
  const [artifact, setArtifact] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const cancellation = new AbortController();
    setError('');
    client.artifact(reference.id, runId, cancellation.signal).then(value => {
      if (cancellation.signal.aborted) return;
      if (value.runId !== runId || value.momentId !== momentId || value.id !== reference.id) throw new Error('This visual does not belong to the selected moment.');
      setArtifact(value);
    }).catch(failure => { if (!cancellation.signal.aborted) setError(failure.message); });
    return () => cancellation.abort();
  }, [client, runId, momentId, reference.id, attempt]);
  if (error) return <div className="lecture-artifact-error" role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry visual</button></div>;
  if (!artifact) return <p role="status">Loading {reference.title}…</p>;
  return <ArtifactVisual artifact={artifact} onSelectMoment={onSelectMoment}/>;
}

function ArtifactRequestPanel({ moment, client, runId }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('chart');
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef(null);
  const identity = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event) {
    event.preventDefault();
    if (pending || !prompt.trim()) return;
    const fingerprint = JSON.stringify([kind, prompt.trim()]);
    if (identity.current?.fingerprint !== fingerprint) identity.current = { fingerprint, requestId: crypto.randomUUID() };
    const cancellation = new AbortController();
    request.current = cancellation;
    setPending(true); setError(''); setMessage('');
    try {
      await client.createArtifact({ runId, requestId: identity.current.requestId, momentId: moment.id, kind, prompt: prompt.trim() }, cancellation.signal);
      if (cancellation.signal.aborted) return;
      setMessage('Visual added to this moment.'); setPrompt(''); setOpen(false); identity.current = null;
    } catch (failure) { if (!cancellation.signal.aborted) setError(failure.message); }
    finally { if (!cancellation.signal.aborted) setPending(false); }
  }
  return <div className="lecture-artifact-request">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Request an artifact</button>
    {open && <form onSubmit={submit}>
      <label>Visual format<select aria-label="Visual format" value={kind} disabled={pending} onChange={event => setKind(event.target.value)}>
        <option value="chart">Chart</option><option value="animation">Animated diagram</option>
      </select></label>
      <label>What would help?<textarea aria-label="Describe the artifact" value={prompt} disabled={pending} maxLength={2000} required
        placeholder={kind === 'chart' ? 'Compare the quantities discussed in this moment…' : 'Walk through this process one step at a time…'} onChange={event => setPrompt(event.target.value)}/></label>
      <button type="submit" disabled={pending || !prompt.trim()}>{pending ? 'Creating visual…' : error ? 'Retry artifact' : 'Generate artifact'}</button>
      {error && <p role="alert">{error}</p>}
    </form>}
    {message && <p role="status">{message}</p>}
  </div>;
}

export function MomentArtifacts({ moment, client, runId, onSelectMoment }) {
  const generated = moment.artifacts.filter(item => client && ['chart', 'animation'].includes(item.kind) && /^[a-f0-9-]{36}$/i.test(item.id));
  const linked = moment.artifacts.filter(item => !generated.includes(item));
  return <>
    <div className="detail-actions">{linked.map(artifact => <a key={artifact.id} href={artifact.url} target="_blank" rel="noreferrer">{artifact.title} ↗</a>)}</div>
    {client && runId ? <ArtifactRequestPanel key={runId + '/' + moment.id} moment={moment} client={client} runId={runId}/>
      : <p className="notes">Open a live simulation to request a visual.</p>}
    {generated.map(reference => <SavedArtifact key={reference.id} reference={reference} momentId={moment.id} client={client} runId={runId} onSelectMoment={onSelectMoment}/>)}
  </>;
}
