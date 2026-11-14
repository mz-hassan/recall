import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Dialog } from '../ui.jsx';
import { readStored } from '../storage.js';
import { art, headlines, moments as curated, subtitles } from './content.js';
import './lecture.css';
import { datasetLectures, loadTranscript } from './dataset.js';
import { makeTranscriptMoments, replayOptions } from './replay.js';
import { MomentChat, MomentExtras } from './MomentExtras.jsx';

const formatTime = seconds => [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
const slideNumber = slide => String(slide.page).padStart(2, '0');
const demoMoments = curated.map((moment, index) => ({
  ...moment, id: 'ai/2/curated/' + index, headline: headlines[index], lede: subtitles[index], artIndex: index,
  slides: [{ page: moment.slide, url: 'assets/slide-' + String(moment.slide).padStart(2, '0') + '.png' }],
  equations: [], artifacts: [], graph: null,
}));
demoMoments[5] = {
  ...demoMoments[5],
  slides: [demoMoments[5].slides[0], { page: 8, url: 'assets/slide-08.png' }],
  equations: [{ expression: 'J(π) − J(π*) ≤ O(Tε)', explanation: 'Under the DAgger assumptions, excess cost scales with the horizon T and the learned policy error ε, with a constant depending on the cost of a mistake.' }],
  artifacts: [{ id: 'dagger-paper', kind: 'reading', title: 'DAgger paper', url: 'pdfs/ai-02-reading.pdf' }],
  graph: { origin: 'fixture', nodes: [{ id: 'rollout', label: 'Policy rollout' }, { id: 'expert', label: 'Expert labels' }, { id: 'dataset', label: 'Aggregated dataset' }],
    edges: [{ id: 'query', from: 'rollout', to: 'expert', relation: 'queries' }, { id: 'append', from: 'expert', to: 'dataset', relation: 'adds to' }] },
};

function MomentDetail({ moment, saved, onSave, onOpen, onChat }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    {moment.headline ? <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/> : <p className="chunk-copy">{moment.summary || moment.quote}</p>}
    <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" onClick={onChat}>Ask about this <span>↗</span><small>PREVIEW</small></button>
    </div>
    {moment.slides.map(slide => <button key={slide.page} className="slide-frame" aria-label={'Expand original slide ' + slide.page} onClick={() => onOpen({ slide })}>
      <img src={slide.url} alt={'Original lecture slide ' + slide.page + ': ' + moment.short}/>
      <span className="caption"><span>FROM THE LECTURE · SLIDE {slideNumber(slide)}</span><span>EXPAND ↗</span></span>
    </button>)}
    {moment.intuition && <div className="intuition"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>}
    <MomentExtras moment={moment}/>
    <div className="detail-actions"><button onClick={() => onOpen('transcript')}>Read the source ↗</button><button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button></div>
    <p className="notes">{moment.type === 'TRANSCRIPT' ? 'Time reflects simulated playback.' : moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
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

function Lecture({ allMoments, lecture, options, rich }) {
  const duration = rich ? 3660 : allMoments.at(-1).time + options.interval;
  const start = options.live ? 0 : allMoments.at(-1).time;
  const initialIndex = allMoments.findLastIndex(moment => moment.time <= start);
  const [elapsed, setElapsed] = useState(start);
  const [target, setTarget] = useState(rich ? 5 : initialIndex);
  const [chat, setChat] = useState(false);
  const saveKey = rich ? 'recall-saved' : 'recall-saved-ai-' + lecture.id + '-' + options.words;
  const moments = allMoments.filter(moment => moment.time <= elapsed);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(options.live);
  const [saved, setSaved] = useState(() => readStored(saveKey));
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const stage = useRef(null);
  const nodes = useRef([]);
  const closeButton = useRef(null);
  const detail = useRef(null);
  const gesture = useRef({ y: null, moved: false });
  const toastTimer = useRef(null);
  const liveIndex = moments.findLastIndex(moment => moment.time <= elapsed);
  const focused = Math.max(0, Math.min(liveIndex, Math.round(target)));
  const moment = moments[focused];

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
    if (expanded) detail.current.scrollTop = 0;
  }, [expanded, focused, liveIndex, playing]);
  useLayoutEffect(() => {
    if (expanded) closeButton.current.focus({ preventScroll: true });
  }, [expanded]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setElapsed(seconds => Math.min(duration, seconds + 1)), 1000);
    return () => clearInterval(interval);
  }, [playing, duration]);
  const previousLiveIndex = useRef(liveIndex);
  useEffect(() => {
    const previous = previousLiveIndex.current;
    previousLiveIndex.current = liveIndex;
    if (liveIndex > previous && playing) {
      setTarget(value => Math.round(value) === previous ? liveIndex : value);
      notify('A new thought has joined the thread.');
    }
    if (elapsed === duration && playing) {
      setPlaying(false);
      notify('Lecture complete. Rewind whenever you need.');
    }
  }, [elapsed, liveIndex, playing, duration]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const element = stage.current;
    let snapTimer, touchTimer;
    const state = gesture.current;
    function shift(delta) {
      setTarget(value => Math.max(0, Math.min(liveIndex, value + delta)));
    }
    function wheel(event) {
      if (modal || event.ctrlKey || event.target.closest('.detail')) return;
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
      if (state.y === null || event.target.closest('.detail')) return;
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
    const next = saved.includes(focused) ? saved.filter(i => i !== focused) : [...saved, focused];
    setSaved(next);
    try { localStorage.setItem(saveKey, JSON.stringify(next)); }
    catch { notify('This change will last for this session.'); return; }
    notify(next.includes(focused) ? 'Moment saved.' : 'Moment removed from your saved ideas.');
  }

  return <>
    <div className="ambient" aria-hidden="true"/><div className="grain" aria-hidden="true"/>
    <header><Brand href="./#course/ai" lecture/>
      <button id="lectureInfo" className="lecture-name" onClick={() => setModal('about')}>AI ALIGNMENT <span>{lecture.id.padStart(2, '0')}</span><small>{rich ? 'When imitation fails' : lecture.title}</small></button>
      <div className="header-actions"><a href={'./#lecture/ai/' + lecture.id} className="map-button source-return" aria-label="Lecture and sources"><span>Lecture &amp; sources</span> ↗</a>
        <button className="map-button" onClick={() => setModal('about')}>{options.live ? 'Simulation settings' : 'About replay'}</button>
      </div>
    </header>
    <main id="experience" ref={stage}>
      <div className="chapter-label"><span className="micro">THE THREAD</span><span>{String(focused + 1).padStart(2, '0')} / {String(liveIndex + 1).padStart(2, '0')}</span></div>
      <nav className="time-axis" aria-label="Lecture moments">{moments.slice(0, liveIndex + 1).map((item, index) =>
        <button key={item.id} className={index === focused ? 'active' : ''} aria-current={index === focused ? 'step' : 'false'} aria-label={'Go to ' + item.short + ' at ' + item.label} onClick={() => go(index)}>{item.label}</button>
      )}</nav>
      <div className="axis-caption">LECTURE TIME</div><div className="orbit" aria-hidden="true"/><div className="focus-halo" aria-hidden="true"/>
      <div className="stage" aria-label="Scrollable lecture timeline">{moments.map((item, index) => {
        const accessible = index <= liveIndex && Math.abs(index - focused) <= 1;
        return <button key={item.id} ref={node => { nodes.current[index] = node; }} className={'moment' + (index === focused ? ' current' : '')}
          aria-label={item.short + ': explore moment'} aria-hidden={!accessible} tabIndex={accessible ? 0 : -1}
          onClick={() => {
            if (gesture.current.moved) return;
            if (index !== focused) go(index);
            else setExpanded(true);
          }}>
          <div className="moment-content"><div className="eyebrow"><span className="index">{String(index + 1).padStart(2, '0')}</span>{item.type}{index === liveIndex && ' · NOW'}</div>
            {item.headline ? <h1 dangerouslySetInnerHTML={{ __html: item.headline }}/> : <h1>{item.title}</h1>}<p className="lede">{item.lede || item.quote.slice(0, 150) + "…"}</p>
            <div className="open-hint"><span>↗</span>Step inside this moment</div>
          </div><span className="timestamp">{item.label}</span>{item.artIndex != null && <div className="art" dangerouslySetInnerHTML={{ __html: art(item.artIndex) }}/>}
        </button>;
      })}</div>
      <div className="scroll-instruction"><span>↑</span><div>SCROLL TO REWIND<small>One thought at a time</small></div></div>
      <button ref={closeButton} className="close-detail" aria-label="Close expanded moment" onClick={closeDetail}>✕ <span>Back to the thread</span></button>
      <section ref={detail} id="detail" className="detail" aria-label="Expanded lecture moment" hidden={!expanded}>
        {expanded && <MomentDetail moment={moment} saved={saved.includes(focused)} onSave={saveMoment} onOpen={setModal} onChat={() => setChat(true)}/>}
      </section>
      {expanded && chat && <MomentChat key={moment.id} moment={moment} onClose={() => setChat(false)}/>}
    </main>
    <footer><div className="lecture-status"><button className="pause" aria-label={playing ? 'Pause simulated lecture' : 'Play simulated lecture'} onClick={() => {
      if (elapsed >= duration) { setElapsed(allMoments[0].time); setTarget(0); }
      setPlaying(!playing);
    }}>{playing ? 'Ⅱ' : '▶'}</button><div><div className="status-line"><i/><span>{focused === liveIndex ? options.live ? 'SIMULATION · LIVE EDGE' : 'PAST TIMELINE' : 'REWINDING THE THREAD'}</span></div>
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
        <p>{rich ? 'This replay uses curated explanations and slides.' : 'Transcript chunks use a simulated clock. Playback publishes each chunk at the configured interval.'}</p>
        <form className="replay-config" action="lecture.html" method="get">
          <input type="hidden" name="lecture" value={lecture.id}/><input type="hidden" name="mode" value="live"/>
          <label>Words per chunk<input type="number" name="words" min="30" max="1000" defaultValue={options.words} required/></label>
          <label>Seconds per chunk<input type="number" name="interval" min="1" max="60" defaultValue={options.interval} required/></label>
          <button>Start simulation ↗</button>
        </form></>}
    </Dialog>
    <div id="toast" className={message ? 'show' : ''} role="status">{message}</div>
  </>;
}

function ReplayApp() {
  const [options] = useState(() => replayOptions(location.search));
  const lecture = datasetLectures.find(item => item.id === options.lectureId);
  const rich = lecture?.id === '2' && !options.live;
  const [moments, setMoments] = useState(rich ? demoMoments : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (rich || !lecture?.replay) return;
    let active = true;
    loadTranscript(lecture).then(transcript => {
      const chunks = makeTranscriptMoments(transcript, lecture.id, options);
      if (!active) return;
      if (chunks.length) {
        // Demonstrates what a validated enrichment result can attach to a transcript chunk.
        const example = lecture.id === '2' && options.live
          ? chunks.find(chunk => /aggregat/i.test(chunk.quote) && /expert/i.test(chunk.quote) && /dagger/i.test(chunk.quote))
          : null;
        if (example) {
          const { slides, equations, graph, intuition, artifacts } = demoMoments[5];
          Object.assign(example, {
            title: 'DAgger: learning from visited states', short: 'DAgger',
            summary: 'The policy visits states, the expert labels the actions to take, and the learner retrains on the accumulated dataset.',
            slides, equations, graph, intuition, artifacts,
          });
        }
        setMoments(chunks);
      }
      else setError('This transcript is empty.');
    }).catch(() => { if (active) setError('Could not load the lecture transcript.'); });
    return () => { active = false; };
  }, [lecture, options, rich]);

  if (moments) return <Lecture allMoments={moments} lecture={lecture} options={options} rich={rich}/>;
  return <section className="replay-error"><Brand href="./#course/ai" lecture/>
    <p role="status">{error || (lecture?.replay ? 'Loading transcript…' : 'This lecture has no transcript available.')}</p>
    <a href="./#course/ai">← Back to course</a>
  </section>;
}

createRoot(document.getElementById('root')).render(<ReplayApp/>);
