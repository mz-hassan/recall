import { useEffect, useRef, useState } from 'react';
import { captureMicrophone } from './capture.js';
import { createAudioQueue } from './audioQueue.js';

async function api(path, body, signal) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-recall-microphone': '1' },
    ...(body !== undefined && { body: JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240000)]) : AbortSignal.timeout(240000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The microphone request failed.');
  return data;
}

export function useMicrophoneCapture({ client, enabled, onStarted }) {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('idle');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [queued, setQueued] = useState(0);
  const capture = useRef(null), session = useRef(null), queue = useRef(null);
  const recording = useRef(false), pendingStream = useRef(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    api('/api/speech/status').then(value => { if (mounted.current) setStatus(value); }).catch(failure => { if (mounted.current) setError(failure.message); });
    function release() { recording.current = false; capture.current?.stop(); queue.current?.cancel(); pendingStream.current?.getTracks().forEach(track => track.stop()); }
    window.addEventListener('pagehide', release);
    return () => { mounted.current = false; release(); window.removeEventListener('pagehide', release); };
  }, [client, enabled]);
  async function stop() {
    recording.current = false;
    if (mounted.current) setMode('finishing');
    await capture.current?.stop(); capture.current = null;
    await queue.current?.drain();
    try { if (session.current) await api(client.base + '/microphone/finish', { runId: session.current.runId }); }
    catch (failure) { if (mounted.current) setError(failure.message); }
    finally { session.current = null; if (mounted.current) setMode('idle'); }
  }
  function packet(input) { if (mounted.current) queue.current?.push(input); }
  async function start() {
    if (!enabled || mode !== 'idle' || queued) return;
    setMode('starting'); setError('');
    let media;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture needs localhost or HTTPS.');
      media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      pendingStream.current = media;
      session.current = await api(client.base + '/microphone', {});
      if (!mounted.current) {
        media.getTracks().forEach(track => track.stop());
        await api(client.base + '/microphone/finish', { runId: session.current.runId });
        session.current = null; return;
      }
      onStarted(await client.snapshot());
      const runId = session.current.runId;
      queue.current = createAudioQueue({
        send: (input, signal) => api(client.base + '/microphone/audio', { ...input, runId }, signal),
        onChange: value => { if (mounted.current) setQueued(value); },
        onError: failure => { if (mounted.current) { setError(failure.message + ' Captured topics are preserved.'); void stop(); } },
        onSlow: () => { if (recording.current && mounted.current) { setError('This laptop is more than 90 seconds behind. Finishing captured audio before continuing.'); void stop(); } },
      });
      capture.current = await captureMicrophone(media, { onPacket: packet, onLevel: value => { if (mounted.current) setLevel(value); } });
      if (!mounted.current) { await capture.current.stop(); capture.current = null; return; }
      pendingStream.current = null; recording.current = true; setMode('listening');
      setStatus(await api('/api/speech/status'));
      media.getAudioTracks()[0].addEventListener('ended', () => { if (recording.current) { setError('The microphone disconnected.'); void stop(); } }, { once: true });
    } catch (failure) {
      media?.getTracks().forEach(track => track.stop()); pendingStream.current = null;
      if (session.current) { try { await api(client.base + '/microphone/finish', { runId: session.current.runId }); } catch {} }
      session.current = null;
      if (mounted.current) { setMode('idle'); setError(failure.message); }
    }
  }
  return { status, mode, error, level, queued, start, stop, listening: mode === 'listening', pending: mode !== 'idle' && mode !== 'listening' };
}
