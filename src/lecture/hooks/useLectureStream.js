import { useCallback, useEffect, useRef, useState } from 'react';
import { createStreamController } from '../api.js';
import { initialStreamState, mergeMomentEvent } from '../streamState.js';

export function useLectureStream(source, elapsed, generation = 0) {
  const [state, setState] = useState(() =>
    (source?.initialEvents ?? []).reduce(mergeMomentEvent, initialStreamState()));
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [error, setError] = useState('');
  const controller = useRef(null);
  const current = useRef(initialStreamState());

  useEffect(() => {
    if (!source) return;
    current.current = (source.initialEvents ?? []).reduce(mergeMomentEvent, initialStreamState());
    setState(current.current);
    setError('');
    const stream = createStreamController(source, event => {
      current.current = mergeMomentEvent(current.current, event);
      setState(current.current);
    }, (status, message = '') => { setConnectionStatus(status); setError(message); });
    controller.current = stream;
    try { stream.connect(); }
    catch (failure) { setError(failure.message); setConnectionStatus('error'); }
    return () => { stream.close(); controller.current = null; };
  }, [source, generation]);

  useEffect(() => {
    if (!source) return;
    try { controller.current?.advanceTo(elapsed); }
    catch (failure) { setError(failure.message); setConnectionStatus('error'); }
  }, [source, elapsed, generation]);

  const reconnect = useCallback(() => {
    try {
      setError('');
      controller.current?.reconnect();
    } catch (failure) { setError(failure.message); setConnectionStatus('error'); }
  }, []);

  return { ...state, connectionStatus, error, reconnect };
}
