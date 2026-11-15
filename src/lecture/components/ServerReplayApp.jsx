import React, { useEffect, useMemo, useState } from 'react';
import { Brand } from '../../ui.jsx';
import { createLectureClient, createServerStream, openLectureSession } from '../api.js';
import { useMicrophoneCapture } from '../microphone/useMicrophoneCapture.js';

export function ServerReplayApp({ lecture, options, children }) {
  const courseId = lecture.courseId ?? 'ai';
  const client = useMemo(() => createLectureClient(courseId, lecture.id,fetch,options.prepared?'/api/prepared':'/api'), [courseId, lecture.id,options.prepared]);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [info,setInfo]=useState(null);
  const capture = useMicrophoneCapture({ client, enabled: options.microphone, onStarted: setSnapshot });
  useEffect(() => {
    const cancellation = new AbortController();
    const restart = new URLSearchParams(location.search).get('restart') === '1';
    setError('');
    const opening=options.prepared?Promise.all([client.snapshot(cancellation.signal),client.info(cancellation.signal)]).then(([value,metadata])=>{setInfo(metadata);return value;}):options.microphone?client.snapshot(cancellation.signal):openLectureSession(client,options,{restart,signal:cancellation.signal});
    opening.then(value => {
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
  const source = useMemo(() => snapshot ? {...createServerStream(client, snapshot),prepared:options.prepared,info} : null, [client, snapshot,info,options.prepared]);
  if (source) return children(source, snapshot.moments, options.microphone ? capture : null);
  return <section className="replay-error"><Brand href={'./#course/' + courseId} lecture/>
    <p role="status">{error || 'Connecting to the lecture…'}</p>
    {error && <><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry connection</button>
      {courseId === 'ai' && lecture.id === '2' && <a href="lecture.html?lecture=2&mode=live&transport=fixture">Open offline fixture demo</a>}</>}
    <a href={'./#course/' + courseId}>Back to course</a>
  </section>;
}
