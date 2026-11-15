import React, { useEffect, useId, useState } from 'react';
import './behaviorCloningVisual.css';

const visuals = {
  'ai/2/curated/2': { kind: 'shift', title: 'A wrong turn changes the world', description: 'Scrub through a rollout. The expert stays inside familiar training states; a small learner deviation leads into states with no demonstration coverage.' },
  'ai/2/curated/4': { kind: 'cost', title: 'The horizon amplifies a mistake', description: 'Compare a linear reference with the quadratic worst-case scaling discussed in the lecture. These are illustrative scaling curves, not measured performance or exact guarantees.' },
  'ai/2/curated/5': { kind: 'dagger', title: 'Turn unfamiliar states into training data', description: 'Follow one DAgger iteration: visit states with the learner, query expert actions, add those pairs to the dataset, then retrain.' },
};
const steps = ['Roll out the learner', 'Ask the expert', 'Aggregate state–action pairs', 'Retrain the policy'];
const nodes = [[140, 85], [430, 85], [430, 235], [140, 235]];
const path = (fn, max = 1) => Array.from({ length: 61 }, (_, i) => {
  const t = i / 60 * max;
  return `${i ? 'L' : 'M'}${60 + t * 470},${fn(t)}`;
}).join(' ');

export function BehaviorCloningVisual({ momentId }) {
  const visual = visuals[momentId];
  return visual ? <Visual key={momentId} visual={visual}/> : null;
}

function Visual({ visual }) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [epsilon, setEpsilon] = useState(0.02);
  const titleId = useId();
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPlaying(!reduced.matches);
    const stop = () => { if (reduced.matches) setPlaying(false); };
    reduced.addEventListener('change', stop);
    return () => reduced.removeEventListener('change', stop);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setProgress(value => value >= 100 ? 0 : value + 0.5), 60);
    return () => clearInterval(timer);
  }, [playing]);
  const t = progress / 100;
  const phase = Math.min(3, Math.floor(t * 4));
  const learnerY = x => 230 - 55 * x - 130 * Math.pow(Math.max(0, (x - 0.32) / 0.68), 1.5);
  const horizon = Math.round(t * 20);
  return <figure className="bc-visual" aria-labelledby={titleId}>
    <figcaption><span className="bc-kicker">INTERACTIVE EXPLAINER · {visual.kind === 'dagger' ? '03' : visual.kind === 'cost' ? '02' : '01'}</span>
      <h3 id={titleId}>{visual.title}</h3><p>{visual.description}</p></figcaption>
    <svg viewBox="0 0 600 320" role="img" aria-label={visual.title}>
      {visual.kind === 'shift' && <>
        <path d="M60 230L530 175" stroke="var(--bc-green)" strokeWidth="65" opacity=".08"/>
        <text x="65" y="285">Expert demonstration coverage</text>
        <text x="335" y="35" fill="var(--bc-peach)">Unfamiliar states</text>
        <path d={path(x => 230 - 55 * x)} className="bc-reference"/>
        <path d={path(learnerY, t)} className="bc-line bc-peach"/>
        <circle cx={60 + t * 470} cy={230 - 55 * t} r="6" fill="var(--bc-green)"/>
        <circle cx={60 + t * 470} cy={learnerY(t)} r="7" fill="var(--bc-peach)"/>
        <circle cx={60 + t * 470} cy={learnerY(t)} r="17" fill="var(--bc-peach)" opacity=".12"/>
        <path d="M210 220V125" className="bc-guide"/><text x="120" y="110">Small initial deviation</text>
      </>}
      {visual.kind === 'cost' && <>
        {[0, 2, 4, 6, 8].map(value => <g key={value}><path d={`M60 ${260 - value * 25}H530`} className="bc-guide"/><text x="35" y={265 - value * 25}>{value}</text></g>)}
        <text x="60" y="30">Illustrative excess cost</text>
        <path d="M60 50V260H540" className="bc-reference"/>
        <path d={path(x => 260 - 20 * x * epsilon * 25)} className="bc-reference"/>
        <path d={path(x => 260 - (20 * x) ** 2 * epsilon * 25, t)} className="bc-line bc-peach"/>
        <circle cx={60 + t * 470} cy={260 - (20 * t) ** 2 * epsilon * 25} r="6" fill="var(--bc-peach)"/>
        {[0, 5, 10, 15, 20].map(value => <text key={value} x={60 + value / 20 * 470} y="283" textAnchor="middle">{value}</text>)}
        <text x="240" y="310">Horizon T (steps)</text>
      </>}
      {visual.kind === 'dagger' && <>
        <path d="M140 85H430V235H140Z" className="bc-reference"/>
        {nodes.map(([x, y], i) => <g key={i} opacity={phase === i ? 1 : .42}>
          <circle cx={x} cy={y} r="37" fill="var(--bc-surface)" stroke={phase === i ? 'var(--bc-green)' : '#43554d'}/>
          <text x={x} y={y + 6} textAnchor="middle" className="bc-number">0{i + 1}</text>
          <text x={x} y={y + (i < 2 ? -52 : 60)} textAnchor="middle">{['Learner rollout', 'Expert labels', 'Aggregate data', 'Retrain'][i]}</text>
        </g>)}
        <text x="285" y="155" textAnchor="middle">Stage {phase + 1} / 4</text>
        <text x="285" y="178" textAnchor="middle" fill="var(--bc-green)">D ← D ∪ new labels</text>
        <circle cx={nodes[phase][0] + (nodes[(phase + 1) % 4][0] - nodes[phase][0]) * (t === 1 ? 1 : t * 4 % 1)} cy={nodes[phase][1] + (nodes[(phase + 1) % 4][1] - nodes[phase][1]) * (t === 1 ? 1 : t * 4 % 1)} r="5" fill="var(--bc-green)"/>
      </>}
    </svg>
    <div className="bc-readout">{visual.kind === 'shift' ? <><span>● Expert</span><span>● Learner</span><strong>{t < .32 ? 'Inside training coverage' : 'Distribution gap opens'}</strong></>
      : visual.kind === 'cost' ? <><span>Tε · {(horizon * epsilon).toFixed(2)}</span><span>T²ε · {(horizon ** 2 * epsilon).toFixed(2)}</span><strong>T = {horizon}</strong></>
        : <strong>{steps[phase]}</strong>}</div>
    {visual.kind === 'cost' && <label className="bc-epsilon">Expert-state error ε <select value={epsilon} onChange={event => setEpsilon(Number(event.target.value))}><option value="0.005">0.5%</option><option value="0.01">1%</option><option value="0.02">2%</option></select></label>}
    <div className="bc-controls"><button type="button" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause explainer' : 'Play explainer'}>{playing ? 'Ⅱ Pause' : '▷ Play'}</button>
      <input type="range" min="0" max="100" step="0.5" value={progress} aria-label="Explainer progress" onChange={event => { setPlaying(false); setProgress(Number(event.target.value)); }}/>
      <button type="button" onClick={() => { setProgress(0); setPlaying(false); }}>Reset</button></div>
    <small className="bc-footnote">Illustrative teaching artifact · based on this topic’s lecture notes</small>
  </figure>;
}
