import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLectureClient, createServerStream } from '../api.js';
import { useLectureStream } from '../hooks/useLectureStream.js';
import { MomentDetail } from '../MomentDetail.jsx';
import { MomentChat } from '../components/MomentChat.jsx';
import { captureMicrophone } from './capture.js';
import { SlideViewer } from './SlideViewer.jsx';
import '../lecture.css';
import './pilot.css';

document.body.classList.add('cs50-pilot');
const client = createLectureClient('cs50', '0');
async function api(path, body, timeout = 240000) {
  const response = await fetch('/api' + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-recall-microphone': '1' },
    ...(body !== undefined && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Recall could not complete this request.');
  return data;
}

function Pilot() {
  const [snapshot, setSnapshot] = useState(null);
  const source = useMemo(() => snapshot ? createServerStream(client, snapshot) : null, [snapshot]);
  const timeline = useLectureStream(source, 0);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('idle');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [queued, setQueued] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [selected, setSelected] = useState(null);
  const [follow, setFollow] = useState(true);
  const [chat, setChat] = useState(false);
  const capture = useRef(null), session = useRef(null), queue = useRef(Promise.resolve()), backlog = useRef(0), failed = useRef(false), recording = useRef(false);
  const pendingStream = useRef(null);
  const moment = (follow ? timeline.moments.at(-1) : timeline.moments.find(item => item.id === selected)) ?? timeline.moments.at(-1);
  useEffect(() => {
    let active = true;
    api('/speech/status').then(value => { if (active) setStatus(value); }).catch(failure => { if (active) setError(failure.message); });
    client.snapshot().then(value => { if (active) setSnapshot(value); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; recording.current = false; capture.current?.stop(); pendingStream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    function stopOnLeave() { recording.current = false; capture.current?.stop(); pendingStream.current?.getTracks().forEach(track => track.stop()); }
    window.addEventListener('pagehide', stopOnLeave);
    return () => window.removeEventListener('pagehide', stopOnLeave);
  }, []);
  async function stop() {
    recording.current = false;
    setMode('finishing');
    await capture.current?.stop(); capture.current = null;
    await queue.current;
    try { if (session.current) await api(client.base.replace('/api', '') + '/microphone/finish', { runId: session.current.runId }); }
    catch (failure) { setError(failure.message); }
    finally { session.current = null; setMode('idle'); }
  }
  function packet(input) {
    if (failed.current) return;
    backlog.current++; setQueued(backlog.current);
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      const result = await api(client.base.replace('/api', '') + '/microphone/audio', { ...input, runId: session.current.runId });
      if (result.text) setTranscript(previous => [...previous, { seq: input.seq, time: input.time, text: result.text }]);
    }).catch(failure => {
      failed.current = true; recording.current = false; setError(failure.message + ' Captured topics are preserved. Start again when ready.');
      void stop();
    }).finally(() => { backlog.current--; setQueued(backlog.current); });
    if (backlog.current >= 5 && recording.current) {
      setError('Recognition is falling behind. Capture stopped so audio is not silently dropped. Wait for the queued chunks, then start a new capture.');
      void stop();
    }
  }
  async function start() {
    if (mode !== 'idle' || backlog.current) return;
    setMode('starting'); setError('');
    let media;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture needs localhost or HTTPS in a supported browser.');
      media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true }, video: false });
      pendingStream.current = media;
      session.current = await api(client.base.replace('/api', '') + '/microphone', {});
      setSnapshot(await client.snapshot());
      setTranscript([]); setSelected(null); setFollow(true); setChat(false);
      queue.current = Promise.resolve(); failed.current = false;
      capture.current = await captureMicrophone(media, { onPacket: packet, onLevel: setLevel });
      pendingStream.current = null; recording.current = true; setMode('listening');
      setStatus(await api('/speech/status'));
      media.getAudioTracks()[0].addEventListener('ended', () => { if (recording.current) { setError('The microphone disconnected.'); void stop(); } }, { once: true });
    } catch (failure) {
      media?.getTracks().forEach(track => track.stop()); pendingStream.current = null;
      if (session.current) { try { await api(client.base.replace('/api', '') + '/microphone/finish', { runId: session.current.runId }); } catch {} }
      session.current = null; setMode('idle'); setError(failure.message);
    }
  }
  function selectMoment(id) { setFollow(false); setSelected(id); }
  const listening = mode === 'listening';
  return <div className="pilot-shell">
    <header className="pilot-header"><a href="./">RECALL</a><span>CS50 · LECTURE 0 · SCRATCH</span><a href="https://cs50.harvard.edu/x/2025/weeks/0/" target="_blank" rel="noreferrer">Official course ↗</a></header>
    <section className="pilot-intro"><small>TWO LAPTOP LIVE TEST</small><h1>Listen here. Follow the lecture.</h1>
      <p>Play CS50 on the other laptop’s speakers, then start listening here. Keep the laptops close and use a quiet room.</p>
      <div className="pilot-links"><a href="https://www.youtube.com/watch?v=2WtPyqwTLKM" target="_blank" rel="noreferrer">Open lecture video ↗</a><a href="https://cs50.harvard.edu/x/2025/notes/0/" target="_blank" rel="noreferrer">Lecture notes ↗</a><a href="/api/datasets/cs50/lecture0/notes.txt" target="_blank" rel="noreferrer">Saved notes ↗</a><a href="/api/datasets/cs50/lecture0/transcript.txt" target="_blank" rel="noreferrer">Reference transcript ↗</a></div>
    </section>
    <section className="pilot-controls" aria-label="Microphone controls">
      <div><strong>{listening ? '● Listening on this laptop' : mode === 'starting' ? 'Loading local model and microphone…' : mode === 'finishing' ? 'Finishing queued audio…' : 'Microphone off'}</strong>
        <span>{status?.model ?? 'Whisper large-v3-turbo'} · local CPU · about 12 seconds of audio per update</span></div>
      <meter min="0" max="1" value={level} aria-label="Microphone audio level"/>
      {listening ? <button onClick={stop}>Stop listening</button> : <button disabled={mode !== 'idle' || queued > 0 || status?.installed === false} onClick={start}>{snapshot?.moments.length ? 'Start new capture' : 'Start listening'}</button>}
      <span role="status">{queued ? `${queued} audio chunk${queued === 1 ? '' : 's'} processing` : 'Ready for audio'}</span>
    </section>
    <p className="pilot-privacy">Audio stays in memory on this laptop and is decoded by the installed local model. Transcript text goes to Recall’s configured AI provider for topics, notes, chat, and visuals. The reference transcript is never substituted for microphone results. Starting a new capture replaces this pilot timeline.</p>
    {status?.installed === false && <p role="alert">Install the local speech model first: <code>powershell -ExecutionPolicy Bypass -File scripts/install-speech.ps1</code></p>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {timeline.error && <p role="alert">{timeline.error} <button onClick={timeline.reconnect}>Reconnect timeline</button></p>}
    {snapshot?.session?.state === 'playing' && !listening && mode === 'idle' && <p role="status">An earlier timeline is restored. The microphone is off; start a new capture to listen again.</p>}
    <div className="pilot-grid"><section className="pilot-topics"><div className="pilot-section-heading"><h2>Live topics</h2><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)}/> Follow latest</label></div>
      <nav aria-label="Captured topics">{timeline.moments.map(item => <button key={item.id} aria-current={moment?.id === item.id ? 'step' : undefined} onClick={() => selectMoment(item.id)}>{item.label} · {item.short}</button>)}</nav>
      {moment ? <><MomentDetail moment={{ ...moment, slides: [] }} client={client} runId={timeline.runId} onOpen={() => document.getElementById('pilot-transcript')?.scrollIntoView({ behavior: 'smooth' })}
        onChat={() => setChat(value => !value)} chatEnabled onSelectMoment={selectMoment}/>
        {chat && <MomentChat key={timeline.runId} moment={moment} client={client} runId={timeline.runId} onClose={() => setChat(false)} onSelectMoment={selectMoment}/>}</>
        : <p>No microphone transcript yet. Start listening, then allow one audio chunk plus local decoding time for the first topic.</p>}
      <details id="pilot-transcript" open><summary>Microphone transcript · capture timestamps</summary>
        {transcript.length ? transcript.map(item => <p key={item.seq}><time>{Math.floor(item.time)}s</time> {item.text}</p>) : timeline.moments.map(item => <p key={item.id}><time>{item.label}</time> {item.quote}</p>)}
      </details>
    </section><SlideViewer moment={moment} runId={timeline.runId}/></div>
    <footer>Capture timestamps start at zero when you press Start listening. They do not automatically match the YouTube playhead. Generated notes and suggested slides may need correction.</footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<Pilot/>);
