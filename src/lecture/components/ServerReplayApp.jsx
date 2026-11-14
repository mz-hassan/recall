import React, { useEffect, useMemo, useState } from 'react';
import { Brand } from '../../ui.jsx';
import { createLectureClient, createServerStream, openLectureSession } from '../api.js';

export function ServerReplayApp({ lecture, options, children }) {
  const client = useMemo(() => createLectureClient('ai', lecture.id), [lecture.id]);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const cancellation = new AbortController();
    const restart = new URLSearchParams(location.search).get('restart') === '1';
    setError('');
    openLectureSession(client, options, { restart, signal: cancellation.signal }).then(value => {
      if (cancellation.signal.aborted) return;
      if (restart) {
        const url = new URL(location.href);
        url.searchParams.delete('restart');
        history.replaceState(null, '', url);
      }
      setSnapshot(value);
    }).catch(failure => { if (!cancellation.signal.aborted) setError(failure.message); });
    return () => cancellation.abort();
  }, [client, options, attempt]);
  const source = useMemo(() => snapshot ? createServerStream(client, snapshot) : null, [client, snapshot]);
  if (source) return children(source, snapshot.moments);
  return <section className="replay-error"><Brand href="./#course/ai" lecture/>
    <p role="status">{error || 'Connecting to the lecture…'}</p>
    {error && <><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry connection</button>
      {lecture.id === '2' && <a href="lecture.html?lecture=2&mode=live&transport=fixture">Open offline fixture demo</a>}</>}
    <a href="./#course/ai">Back to course</a>
  </section>;
}
