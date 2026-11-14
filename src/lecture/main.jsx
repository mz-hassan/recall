import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Dialog } from '../ui.jsx';
import { readStored } from '../storage.js';
import { art } from './content.js';
import './lecture.css';
import { datasetLectures, loadTranscript } from './dataset.js';
import { makeTranscriptMoments, replayOptions } from './replay.js';
import { MomentExtras } from './MomentExtras.jsx';
import { MomentChat } from './components/MomentChat.jsx';
import { ServerReplayApp } from './components/ServerReplayApp.jsx';
import { demoMoments } from './fixtures/lecture02.js';
import { recordMomentStream } from './fixtures/stream.js';
import { useLectureStream } from './hooks/useLectureStream.js';
import { targetAfterArrival } from './streamState.js';

const formatTime = seconds => [Math.floor(seconds / 60), Math.floor(seconds % 60)].map(n => String(n).padStart(2, '0')).join(':');
const slideNumber = slide => String(slide.page).padStart(2, '0');
function MomentDetail({ moment, saved, onSave, onOpen, onChat, chatEnabled, client, runId, onSelectMoment }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    {moment.headline ? <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/> : <p className="chunk-copy">{moment.summary || moment.quote}</p>}
    {moment.enrichment === 'pending' && <p className="lecture-stream-note" role="status">Filling in notes… The source transcript is available now.</p>}
    {moment.enrichment === 'failed' && <p className="lecture-stream-note" role="status">Notes are unavailable. You can still read the source transcript.</p>}
    <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" onClick={onChat}>Ask about this <span>↗</span><small>{chatEnabled ? 'LECTURE CHAT' : 'PREVIEW'}</small></button>
    </div>
    {moment.slides.map(slide => <button key={slide.page} className="slide-frame" aria-label={'Expand original slide ' + slide.page} onClick={() => onOpen({ slide })}>
      <img src={slide.url} alt={'Original lecture slide ' + slide.page + ': ' + moment.short}/>
      <span className="caption"><span>FROM THE LECTURE · SLIDE {slideNumber(slide)}</span><span>EXPAND ↗</span></span>
    </button>)}
    {moment.intuition && <div className="intuition"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>}
    <MomentExtras moment={moment} client={client} runId={runId} onSelectMoment={onSelectMoment}/>
    <div className="detail-actions"><button onClick={() => onOpen('transcript')}>Read the source ↗</button><button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button></div>
    <p className="notes">{moment.timeSource === 'simulated' || (!moment.timeSource && moment.type === 'TRANSCRIPT') ? 'Time reflects simulated playback.' : moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
  </>;
}

// Keep frame-by-frame transforms off the React render path. React owns selection and playback.
function useTimelineMotion(stage, nodes, target, expanded, liveIndex) {
  const motion = useRef({ position: target, expansion: 0, target, expanded, liveIndex });
  useLayoutEffect(() => {
    Object.assign(motion.current, { target, expanded, liveIndex });
  }, [target, expanded, liveIndex]);
  useLayoutEffect(() => {
    let frame;
    let lastTime = performance.now();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    function draw(now) {
      if (!stage.current) { frame = requestAnimationFrame(draw); return; }
      const dt = Math.min(40, now - lastTime);
      lastTime = now;
      const state = motion.current;
      const reduced = reducedMotion.matches;
      state.position += (state.target - state.position) * (reduced ? 1 : 1 - Math.exp(-dt / 100));
      state.expansion += (Number(state.expanded) - state.expansion) * (reduced ? 1 : 1 - Math.exp(-dt / 150));
      const spacing = Math.min(260, stage.current.clientHeight * .42);
      const width = window.innerWidth;
      nodes.current.forEach((element, index) => {
        if (!element) return;
        const distance = index - state.position;
        const depth = Math.abs(distance);
        const x = -Math.min(270, distance ** 2 * 42) * (1 - state.expansion * .7) - state.expansion * (width <= 800 ? 0 : width * .17);
        const scale = (1 - Math.min(depth * .15, .5)) * (1 - state.expansion * .5);
        const opacity = index > state.liveIndex || depth > 2.3 ? 0 : Math.max(0, 1 - depth * .53) * (1 - state.expansion * .18);
        const tilt = Math.max(-12, Math.min(12, distance * 7));
        element.style.transform = 'translate3d(' + x + 'px,calc(-50% + ' + distance * spacing + 'px),' + -depth * 70 + 'px) scale(' + scale + ') rotateX(' + tilt + 'deg)';
        element.style.opacity = opacity;
        element.style.filter = 'blur(' + Math.max(0, depth - .7) * 1.3 + 'px)';
        element.style.pointerEvents = opacity > .12 ? 'auto' : 'none';
        element.style.zIndex = 10 - Math.round(depth * 2);
      });
      frame = requestAnimationFrame(draw);
    }
    draw(lastTime);
    return () => cancelAnimationFrame(frame);
  }, [stage, nodes]);
}

function Lecture({ allMoments, lecture, options, rich, source }) {
  const server = source?.kind === 'server';
  const fixture = source?.kind === 'fixture';
  const start = options.live ? 0 : allMoments.at(-1)?.time ?? 0;
  const initialIndex = server ? Math.max(0, allMoments.length - 1) : source ? 0 : allMoments.findLastIndex(moment => moment.time <= start);
  const [localElapsed, setElapsed] = useState(start);
  const [target, setTarget] = useState(rich ? 5 : initialIndex);
  const [generation, setGeneration] = useState(0);
  const stream = useLectureStream(source, localElapsed, generation);
  const elapsed = server ? stream.session?.elapsed ?? 0 : localElapsed;
  const duration = server ? Math.max(0, (stream.session?.total ?? 1) - 1) * (stream.session?.interval ?? options.interval)
    : source?.duration ?? (rich ? 3660 : (allMoments.at(-1)?.time ?? 0) + options.interval);
  const [chat, setChat] = useState(false);
  const saveKey = server ? 'recall-saved-live-ai-' + lecture.id + '-' + stream.runId
    : source ? 'recall-saved-fixture-ai-' + lecture.id : rich ? 'recall-saved' : 'recall-saved-ai-' + lecture.id + '-' + options.words;
  const moments = source ? stream.moments : allMoments.filter(moment => moment.time <= elapsed);
  const [expanded, setExpanded] = useState(false);
  const [localPlaying, setPlaying] = useState(false);
  const playing = server ? stream.session?.state === 'playing' : localPlaying;
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState('');
  const [saved, setSaved] = useState(() => readStored(saveKey));
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const stage = useRef(null);
  const nodes = useRef([]);
  const closeButton = useRef(null);
  const detail = useRef(null);
  const gesture = useRef({ y: null, moved: false });
  const toastTimer = useRef(null);
  const liveIndex = moments.length - 1;
  const focused = Math.max(0, Math.min(liveIndex, Math.round(target)));
  const moment = moments[focused];
  const saveId = source ? moment?.id : focused;
  const previousRun = useRef(stream.runId);
  useLayoutEffect(() => {
    if (server && previousRun.current !== stream.runId) {
      setTarget(0); setExpanded(false); setChat(false); setModal(null);
    }
    previousRun.current = stream.runId;
  }, [server, stream.runId]);
  useEffect(() => setSaved(readStored(saveKey)), [saveKey]);

  useTimelineMotion(stage, nodes, target, expanded, liveIndex);
  function notify(text) {
    clearTimeout(toastTimer.current);
    setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(''), 2500);
  }
  function closeDetail() {
    setExpanded(false);
    setChat(false);
    nodes.current[focused]?.focus({ preventScroll: true });
  }
  function go(index) {
    setTarget(Math.max(0, Math.min(liveIndex, index)));
  }

  useLayoutEffect(() => {
    document.body.classList.toggle('expanded', expanded);
    document.body.classList.toggle('rewound', focused !== liveIndex);
    document.body.classList.toggle('playing', playing);
  }, [expanded, focused, liveIndex, playing]);
  useLayoutEffect(() => {
    if (expanded && detail.current) detail.current.scrollTop = 0;
  }, [expanded, moment?.id]);
  useLayoutEffect(() => {
    if (expanded) closeButton.current?.focus({ preventScroll: true });
  }, [expanded]);

  useEffect(() => {
    if (server || !playing) return;
    const interval = setInterval(() => setElapsed(seconds => Math.min(duration, seconds + 1)), 1000);
    return () => clearInterval(interval);
  }, [server, playing, duration]);
  const previousLiveIndex = useRef(liveIndex);
  useEffect(() => {
    const previous = previousLiveIndex.current;
    previousLiveIndex.current = liveIndex;
    if (liveIndex > previous && playing) {
      setTarget(value => targetAfterArrival(value, previous + 1, liveIndex + 1, expanded));
      notify('A new thought has joined the thread.');
    }
    if (!server && elapsed === duration && playing) {
      setPlaying(false);
      notify('Lecture complete. Rewind whenever you need.');
    }
  }, [server, elapsed, liveIndex, playing, duration, expanded]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    let snapTimer, touchTimer;
    const state = gesture.current;
    function shift(delta) {
      setTarget(value => Math.max(0, Math.min(liveIndex, value + delta)));
    }
    function wheel(event) {
      if (modal || event.ctrlKey || event.target.closest('.detail, .moment-chat')) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      shift(Math.max(-.6, Math.min(.6, delta / 420)));
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => setTarget(Math.round), 150);
    }
    function touchStart(event) {
      if (event.target.closest('.detail, .moment-chat') || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      state.y = event.touches[0].clientY;
      state.moved = false;
    }
    function touchMove(event) {
      if (state.y === null || event.target.closest('.detail, .moment-chat')) return;
      const y = event.touches[0].clientY;
      const delta = state.y - y;
      if (Math.abs(delta) > 2) state.moved = true;
      shift(delta / 280);
      state.y = y;
    }
    function touchEnd() {
      state.y = null;
      setTarget(Math.round);
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => { state.moved = false; }, 80);
    }
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('touchstart', touchStart, { passive: true });
    element.addEventListener('touchmove', touchMove, { passive: true });
    element.addEventListener('touchend', touchEnd);
    element.addEventListener('touchcancel', touchEnd);
    return () => {
      clearTimeout(snapTimer);
      clearTimeout(touchTimer);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('touchend', touchEnd);
      element.removeEventListener('touchcancel', touchEnd);
    };
  }, [modal, liveIndex]);
  useEffect(() => {
    function handleKey(event) {
      if (modal) return;
      if (event.key === 'Escape' && expanded) { closeDetail(); return; }
      if (event.target.closest('.detail, .moment-chat') || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      go(event.key === 'Home' ? 0 : event.key === 'End' ? liveIndex : focused + (event.key === 'ArrowUp' ? -1 : 1));
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [modal, expanded, focused, liveIndex]);

  function saveMoment() {
    const next = saved.includes(saveId) ? saved.filter(id => id !== saveId) : [...saved, saveId];
    setSaved(next);
    try { localStorage.setItem(saveKey, JSON.stringify(next)); }
    catch { notify('This change will last for this session.'); return; }
    notify(next.includes(saveId) ? 'Moment saved.' : 'Moment removed from your saved ideas.');
  }

  async function command(action) {
    if (commandPending) return;
    setCommandPending(true); setCommandError('');
    try { await action(); }
    catch (failure) { setCommandError(failure.message); }
    finally { setCommandPending(false); }
  }
  function restart() {
    command(async () => {
      const session = stream.session;
      await source.client.start({ words: session?.words ?? options.words, interval: session?.interval ?? options.interval,
        ...(session ? { limit: session.total } : Number.isFinite(options.limit) ? { limit: options.limit } : {}), start: 'paused' });
      stream.reconnect();
    });
  }
  function playback() {
    if (server) { command(() => playing ? source.client.pause() : source.client.play()); return; }
    if (elapsed >= duration) { setElapsed(source ? 0 : allMoments[0].time); setTarget(0); if (source) setGeneration(value => value + 1); }
    setPlaying(!playing);
  }
  function selectMoment(id) {
    const index = moments.findIndex(item => item.id === id);
    if (index >= 0) go(index); else notify('Waiting for this cited moment to arrive.');
  }

  if (!moment) return <section className="replay-error"><Brand href="./#course/ai" lecture/>
    <p role="status">{stream.error || 'Waiting for the first lecture moment…'}</p>
    <button onClick={stream.reconnect}>Retry stream</button>
    {server && <button disabled={commandPending} onClick={restart}>Restart replay</button>}
    {commandError && <p role="alert">{commandError}</p>}
  </section>;

  return <>
    <div className="ambient" aria-hidden="true"/><div className="grain" aria-hidden="true"/>
    <header><Brand href="./#course/ai" lecture/>
      <button id="lectureInfo" className="lecture-name" onClick={() => setModal('about')}>AI ALIGNMENT <span>{lecture.id.padStart(2, '0')}</span><small>{rich ? 'When imitation fails' : lecture.title}</small></button>
      <div className="header-actions"><a href={'./#lecture/ai/' + lecture.id} className="map-button source-return" aria-label="Lecture and sources"><span>Lecture &amp; sources</span> ↗</a>
        <button className="map-button" onClick={() => setModal('about')}>{options.live ? 'Simulation settings' : 'About replay'}</button>
      </div>
    </header>
    {source && <div className="lecture-stream-status" aria-live="polite">
      <span>{stream.error || (stream.connectionStatus === 'reconnecting' ? 'Reconnecting…' : server
        ? stream.session?.state === 'completed' ? 'Lecture complete' : 'Live lecture stream'
        : stream.connectionStatus === 'complete' ? 'Fixture complete' : 'Recorded fixture stream')}</span>
      <button type="button" onClick={stream.reconnect}>{stream.error ? 'Retry stream' : 'Reconnect stream'}</button>
      {server && <button type="button" disabled={commandPending} onClick={restart}>Restart replay</button>}
      {commandError && <span role="alert">{commandError}</span>}
    </div>}
    <main id="experience" ref={stage}>
      <div className="chapter-label"><span className="micro">THE THREAD</span><span>{String(focused + 1).padStart(2, '0')} / {String(liveIndex + 1).padStart(2, '0')}</span></div>
      <nav className="time-axis" aria-label="Lecture moments">{moments.slice(0, liveIndex + 1).map((item, index) =>
        <button key={item.id} className={index === focused ? 'active' : ''} aria-current={index === focused ? 'step' : 'false'} aria-label={'Go to ' + item.short + ' at ' + item.label} onClick={() => go(index)}>{item.label}</button>
      )}</nav>
      <div className="axis-caption">LECTURE TIME</div><div className="orbit" aria-hidden="true"/><div className="focus-halo" aria-hidden="true"/>
      <div className="stage" aria-label="Scrollable lecture timeline">{moments.map((item, index) => {
        const accessible = index <= liveIndex && Math.abs(index - focused) <= 1;
        return <button key={item.id} data-moment-id={item.id} data-revision={item.revision} ref={node => { nodes.current[index] = node; }} className={'moment' + (index === focused ? ' current' : '')}
          aria-label={item.short + ': explore moment'} aria-hidden={!accessible} tabIndex={accessible ? 0 : -1}
          onClick={() => {
            if (gesture.current.moved) return;
            if (index !== focused) go(index);
            else setExpanded(true);
          }}>
          <div className="moment-content"><div className="eyebrow"><span className="index">{String(index + 1).padStart(2, '0')}</span>{item.type}{index === liveIndex && ' · NOW'}</div>
            {item.headline ? <h1 dangerouslySetInnerHTML={{ __html: item.headline }}/> : <h1>{item.title}</h1>}<p className="lede">{item.lede || item.quote.slice(0, 150) + "…"}</p>
            {item.enrichment === 'pending' && <p className="lecture-stream-note">Filling in notes…</p>}
            <div className="open-hint"><span>↗</span>Step inside this moment</div>
          </div><span className="timestamp">{item.label}</span>{item.artIndex != null && <div className="art" dangerouslySetInnerHTML={{ __html: art(item.artIndex) }}/>}
        </button>;
      })}</div>
      <div className="scroll-instruction"><span>{options.live && !playing ? "▶" : "↑"}</span><div>{server && stream.session?.state === 'completed' ? 'REPLAY COMPLETE' : options.live && !playing ? "PRESS PLAY TO SIMULATE" : "SCROLL TO REWIND"}<small>{server
        ? (stream.session?.published ?? 0) + ' of ' + (stream.session?.total ?? 0) + ' chunks · ' + moments.length + ' topics'
        : options.live ? moments.length + " of " + allMoments.length + (source ? " fixture moments" : " chunks") : "One thought at a time"}</small></div></div>
      <button ref={closeButton} className="close-detail" aria-label="Close expanded moment" onClick={closeDetail}>✕ <span>Back to the thread</span></button>
      <section ref={detail} id="detail" className="detail" aria-label="Expanded lecture moment" hidden={!expanded}>
        {expanded && <MomentDetail moment={moment} saved={saved.includes(saveId)} onSave={saveMoment} onOpen={setModal} onChat={() => setChat(true)} chatEnabled={server}
          client={server ? source.client : null} runId={stream.runId} onSelectMoment={selectMoment}/>}
      </section>
      {expanded && chat && <MomentChat key={server ? stream.runId : moment.id} moment={moment} client={server ? source.client : null}
        runId={stream.runId} onClose={() => setChat(false)} onSelectMoment={selectMoment}/>}
    </main>
    <footer><div className="lecture-status"><button className="pause" aria-label={playing ? 'Pause simulated lecture' : 'Play simulated lecture'}
      disabled={commandPending || (server && stream.session?.state === 'completed')} onClick={playback}>{playing ? 'Ⅱ' : '▶'}</button><div><div className="status-line"><i/><span>{focused === liveIndex ? options.live ? 'SIMULATION · LIVE EDGE' : 'PAST TIMELINE' : 'REWINDING THE THREAD'}</span></div>
      <span className="clock">{formatTime(elapsed)}</span><span className="clock-total"> / {formatTime(duration)}</span></div>
      <div className="wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div></div>
      <div className="footer-center"><button aria-label="Earlier concept" disabled={focused === 0} onClick={() => go(focused - 1)}>↑</button><span id="positionLabel">{moment.short}</span><button aria-label="Later concept" disabled={focused === liveIndex} onClick={() => go(focused + 1)}>↓</button></div>
      <button className="return-live" onClick={() => { closeDetail(); go(liveIndex); }}>Back to now <span>↗</span></button><span className="live-hint">You’re right here.</span>
    </footer>
    <Dialog lecture onClose={() => setModal(null)}>
      {modal?.slide && <><div className="eyebrow">ORIGINAL MATERIAL · SLIDE {modal.slide.page}</div><h2>{moment.short}</h2><img src={modal.slide.url} alt={'Full original slide ' + modal.slide.page}/><p>{lecture.title} · Prof. Scott Niekum</p></>}
      {modal === 'transcript' && <><div className="eyebrow">IN THE LECTURE</div><h2>{moment.short}</h2><blockquote>“{moment.quote}”</blockquote><p>Prof. Scott Niekum · {moment.quoteTime}</p><p className="notes">From the lecture transcript.</p></>}
      {modal === 'about' && <><div className="eyebrow">690S · LECTURE {lecture.id.padStart(2, '0')}</div><h2>{lecture.title}</h2>
        <p>Scroll up to rewind. Select a moment to see its details.</p>
        <p>{server ? 'The server publishes transcript chunks and topic revisions to this timeline. Existing sessions resume when you reopen the lecture. Apply settings to restart a paused replay.' : fixture ? 'This recorded fixture uses authored Lecture 02 excerpts, notes and slides. It demonstrates pending notes and revisions without a backend or AI calls. Press Play to publish each moment at the configured interval.' : rich ? 'This replay uses curated explanations and slides.' : 'Transcript chunks use a simulated clock. Press Play to publish each chunk at the configured interval.'}</p>
        <form className="replay-config" action="lecture.html" method="get">
          <input type="hidden" name="lecture" value={lecture.id}/><input type="hidden" name="mode" value="live"/>
          {fixture && <input type="hidden" name="transport" value="fixture"/>}
          {server && <input type="hidden" name="restart" value="1"/>}
          {!fixture && <label>Words per chunk<input type="number" name="words" min="30" max="1000" defaultValue={stream.session?.words ?? options.words} required/></label>}
          <label>{fixture ? 'Seconds per moment' : 'Seconds per chunk'}<input type="number" name="interval" min="1" max="60" defaultValue={stream.session?.interval ?? options.interval} required/></label>
          <label>{fixture ? 'Moment limit' : 'Chunk limit'}<select aria-label={fixture ? 'Moment limit' : 'Chunk limit'} name="limit" defaultValue={server ? stream.session?.total ?? 6 : Number.isFinite(options.limit) ? options.limit : 'all'}>
            {[...new Set([6, 12, 24, server ? stream.session?.total ?? 6 : Number.isFinite(options.limit) ? options.limit : 6])].map(limit => <option key={limit}>{limit}</option>)}
            <option value="all">{fixture ? 'All fixture moments' : 'Full transcript'}</option>
          </select></label>
          <button>{server ? 'Apply & restart' : 'Apply settings'} ↗</button>
        </form></>}
    </Dialog>
    <div id="toast" className={message ? 'show' : ''} role="status">{message}</div>
  </>;
}

function ReplayApp() {
  const [options] = useState(() => replayOptions(location.search));
  const lecture = datasetLectures.find(item => item.id === options.lectureId);
  const rich = lecture?.id === '2' && !options.live;
  const fixture = lecture?.id === '2' && options.live && new URLSearchParams(location.search).get('transport') === 'fixture';
  const backend = options.live && !fixture;
  const [moments, setMoments] = useState(rich ? demoMoments : fixture ? demoMoments.slice(0, options.limit) : null);
  const source = useMemo(() => fixture ? recordMomentStream(moments, options.interval) : null, [fixture, moments, options.interval]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (backend || rich || fixture || !lecture?.replay) return;
    let active = true;
    loadTranscript(lecture).then(transcript => {
      const chunks = makeTranscriptMoments(transcript, lecture.id, options);
      if (!active) return;
      if (chunks.length) {
        setMoments(options.live ? chunks.slice(0, options.limit) : chunks);
      }
      else setError('This transcript is empty.');
    }).catch(() => { if (active) setError('Could not load the lecture transcript.'); });
    return () => { active = false; };
  }, [lecture, options, rich, fixture, backend]);

  if (backend && lecture) return <ServerReplayApp lecture={lecture} options={options}>{(serverSource, initialMoments) =>
    <Lecture allMoments={initialMoments} lecture={lecture} options={options} rich={false} source={serverSource}/>
  }</ServerReplayApp>;
  if (moments) return <Lecture allMoments={moments} lecture={lecture} options={options} rich={rich} source={source}/>;
  return <section className="replay-error"><Brand href="./#course/ai" lecture/>
    <p role="status">{error || (lecture?.replay ? 'Loading transcript…' : 'This lecture has no transcript available.')}</p>
    <a href="./#course/ai">← Back to course</a>
  </section>;
}

createRoot(document.getElementById('root')).render(<ReplayApp/>);
