import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Dialog } from '../ui.jsx';
import { readStored } from '../storage.js';
import { art, headlines, moments, subtitles } from './content.js';
import './lecture.css';

const formatTime = seconds => [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
const slideNumber = moment => String(moment.slide).padStart(2, '0');
const slideUrl = moment => 'assets/slide-' + slideNumber(moment) + '.png';

function MomentDetail({ moment, saved, onSave, onOpen }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/>
    <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" disabled aria-label="Ask about this moment, coming soon">Ask about this <span>↗</span><small>COMING SOON</small></button>
    </div>
    <button className="slide-frame" aria-label={'Expand original slide ' + moment.slide} onClick={() => onOpen('slide')}>
      <img src={slideUrl(moment)} alt={'Original lecture slide ' + moment.slide + ': ' + moment.short}/>
      <span className="caption"><span>FROM THE LECTURE · SLIDE {slideNumber(moment)}</span><span>EXPAND ↗</span></span>
    </button>
    <div className="intuition"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>
    <div className="detail-actions"><button onClick={() => onOpen('transcript')}>Read the source ↗</button><button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button></div>
    <p className="notes">{moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
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

function Lecture() {
  const [elapsed, setElapsed] = useState(1990);
  const [target, setTarget] = useState(5);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState(() => readStored('recall-saved'));
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const stage = useRef(null);
  const nodes = useRef([]);
  const closeButton = useRef(null);
  const detail = useRef(null);
  const gesture = useRef({ y: null, moved: false });
  const toastTimer = useRef(null);
  const liveIndex = moments.findLastIndex(moment => moment.time <= elapsed);
  const focused = Math.round(target);
  const moment = moments[focused];

  useTimelineMotion(stage, nodes, target, expanded, liveIndex);
  function notify(text) {
    clearTimeout(toastTimer.current);
    setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(''), 2500);
  }
  function closeDetail() {
    setExpanded(false);
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
    const interval = setInterval(() => setElapsed(seconds => Math.min(3660, seconds + 1)), 1000);
    return () => clearInterval(interval);
  }, [playing]);
  const previousLiveIndex = useRef(liveIndex);
  useEffect(() => {
    const previous = previousLiveIndex.current;
    previousLiveIndex.current = liveIndex;
    if (liveIndex > previous && playing) {
      setTarget(value => Math.round(value) === previous ? liveIndex : value);
      notify('A new thought has joined the thread.');
    }
    if (elapsed === 3660 && playing) {
      setPlaying(false);
      notify('Lecture complete. Rewind whenever you need.');
    }
  }, [elapsed, liveIndex, playing]);
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
      if (event.target.closest('.detail')) return;
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
      if (event.target.closest('.detail')) return;
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
    try { localStorage.setItem('recall-saved', JSON.stringify(next)); }
    catch { notify('This change will last for this session.'); return; }
    notify(next.includes(focused) ? 'Saved. Find it in the concept map.' : 'Moment removed from your saved ideas.');
  }

  return <>
    <div className="ambient" aria-hidden="true"/><div className="grain" aria-hidden="true"/>
    <header><Brand href="./#course/ai" lecture/>
      <button id="lectureInfo" className="lecture-name" onClick={() => setModal('about')}>AI ALIGNMENT <span>02</span><small>When imitation fails</small></button>
      <div className="header-actions"><a href="./#lecture/ai/2" className="map-button source-return" aria-label="Lecture and sources"><span>Lecture &amp; sources</span> ↗</a>
        <button id="mapButton" className="map-button" aria-label="Open concept map" onClick={() => setModal('map')}>
          <svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor"><path d="m6 6 12 3-6 10L6 6z"/><circle cx="6" cy="6" r="3" fill="#121719"/><circle cx="18" cy="9" r="3" fill="#121719"/><circle cx="12" cy="19" r="3" fill="#121719"/></svg><span>Concept map</span>
        </button>
      </div>
    </header>
    <main id="experience" ref={stage}>
      <div className="chapter-label"><span className="micro">THE THREAD</span><span>{String(focused + 1).padStart(2, '0')} / {String(liveIndex + 1).padStart(2, '0')}</span></div>
      <nav className="time-axis" aria-label="Lecture moments">{moments.slice(0, liveIndex + 1).map((item, index) =>
        <button key={item.time} className={index === focused ? 'active' : ''} aria-current={index === focused ? 'step' : 'false'} aria-label={'Go to ' + item.short + ' at ' + item.label} onClick={() => go(index)}>{item.label}</button>
      )}</nav>
      <div className="axis-caption">LECTURE TIME</div><div className="orbit" aria-hidden="true"/><div className="focus-halo" aria-hidden="true"/>
      <div className="stage" aria-label="Scrollable lecture timeline">{moments.map((item, index) => {
        const accessible = index <= liveIndex && Math.abs(index - focused) <= 1;
        return <button key={item.time} ref={node => { nodes.current[index] = node; }} className={'moment' + (index === focused ? ' current' : '')}
          aria-label={item.short + ': explore moment'} aria-hidden={!accessible} tabIndex={accessible ? 0 : -1}
          onClick={() => {
            if (gesture.current.moved) return;
            if (index !== focused) go(index);
            else setExpanded(true);
          }}>
          <div className="moment-content"><div className="eyebrow"><span className="index">{String(index + 1).padStart(2, '0')}</span>{item.type}{index === liveIndex && ' · NOW'}</div>
            <h1 dangerouslySetInnerHTML={{ __html: headlines[index] }}/><p className="lede">{subtitles[index]}</p>
            <div className="open-hint"><span>↗</span>Step inside this moment</div>
          </div><span className="timestamp">{item.label}</span><div className="art" dangerouslySetInnerHTML={{ __html: art(index) }}/>
        </button>;
      })}</div>
      <div className="scroll-instruction"><span>↑</span><div>SCROLL TO REWIND<small>One thought at a time</small></div></div>
      <button ref={closeButton} className="close-detail" aria-label="Close expanded moment" onClick={closeDetail}>✕ <span>Back to the thread</span></button>
      <section ref={detail} id="detail" className="detail" aria-label="Expanded lecture moment" hidden={!expanded}>
        {expanded && <MomentDetail moment={moment} saved={saved.includes(focused)} onSave={saveMoment} onOpen={setModal}/>}
      </section>
    </main>
    <footer><div className="lecture-status"><button className="pause" aria-label={playing ? 'Pause simulated lecture' : 'Play simulated lecture'} onClick={() => {
      if (elapsed >= 3660) { setElapsed(1990); setTarget(5); }
      setPlaying(!playing);
    }}>{playing ? 'Ⅱ' : '▶'}</button><div><div className="status-line"><i/><span>{focused === liveIndex ? 'AT THE LIVE EDGE' : 'REWINDING THE THREAD'}</span></div>
      <span className="clock">{formatTime(elapsed)}</span><span className="clock-total"> / 61:00</span></div>
      <div className="wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i}/>)}</div></div>
      <div className="footer-center"><button aria-label="Earlier concept" disabled={focused === 0} onClick={() => go(focused - 1)}>↑</button><span id="positionLabel">{moment.short}</span><button aria-label="Later concept" disabled={focused === liveIndex} onClick={() => go(focused + 1)}>↓</button></div>
      <button className="return-live" onClick={() => { closeDetail(); go(liveIndex); }}>Back to now <span>↗</span></button><span className="live-hint">You’re right here.</span>
    </footer>
    <Dialog lecture onClose={() => setModal(null)}>
      {modal === 'slide' && <><div className="eyebrow">ORIGINAL MATERIAL · SLIDE {moment.slide} / 13</div><h2>{moment.short}</h2><img src={slideUrl(moment)} alt={'Full original slide ' + moment.slide}/><p>Limitations of Behavior Cloning · Prof. Scott Niekum</p></>}
      {modal === 'transcript' && <><div className="eyebrow">IN THE LECTURE</div><h2>{moment.short}</h2><blockquote>“{moment.quote}”</blockquote><p>Prof. Scott Niekum · {moment.quoteTime}</p><p className="notes">From the September 15 transcript. Punctuation lightly normalized.</p></>}
      {modal === 'map' && <><div className="eyebrow">THE SHAPE OF THIS LECTURE</div><h2>Every thought leads somewhere.</h2><p>From imitation to recovery. Choose a concept to follow its thread.</p>
        <div className="graph">{moments.map((item, index) => <button key={item.time} className={index > liveIndex ? 'future' : ''} onClick={() => {
          if (index > liveIndex) setElapsed(item.time);
          setModal(null); closeDetail(); setTarget(index);
        }}><span>{item.label} {saved.includes(index) && ' · SAVED'}{index > liveIndex && ' · UPCOMING'}</span>{item.short}<small>{item.connection}</small></button>)}</div>
        <p className="notes">Read left to right, then down. Upcoming concepts jump the simulated replay forward. ≈ indicates an estimated timestamp.</p></>}
      {modal === 'about' && <><div className="eyebrow">690S · LECTURE 02 · SEPTEMBER 15, 2026</div><h2>When imitation fails.</h2><p>Limitations of Behavior Cloning, taught by Prof. Scott Niekum.</p><p>Scroll up to move into the past, or use the arrow keys. Select the focused thought to open its explanation and slide. Escape returns to the timeline.</p><p className="notes">An interaction prototype using your real lecture slides and transcript. The live session is simulated; no microphone, transcription, or AI service is connected. ≈ marks estimated timestamps. Saved moments stay in this browser.</p></>}
    </Dialog>
    <div id="toast" className={message ? 'show' : ''} role="status">{message}</div>
  </>;
}

createRoot(document.getElementById('root')).render(<Lecture/>);
