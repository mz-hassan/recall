import React, { useEffect, useId, useState } from 'react';
import { Equation } from './Equation.jsx';

const colors = ['#b6f3d3', '#c7b8f1', '#edc4a6', '#9fcaed'];
const number = value => value !== 0 && (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-3)
  ? value.toExponential(2) : Number(value.toPrecision(4)).toLocaleString(undefined, { maximumFractionDigits: 4 });

function Chart({ spec }) {
  const titleId = useId();
  const all = spec.series.flatMap(series => series.values);
  const min = Math.min(0, ...all), max = Math.max(0, ...all);
  const x = index => 60 + index * 420 / (spec.xValues.length - 1);
  const y = value => 230 - (value - min) * 180 / (max - min || 1);
  const baseline = y(0);
  const barWidth = Math.min(36, 360 / spec.xValues.length) / spec.series.length;
  return <>
    <p className="lecture-artifact-basis">{spec.basis === 'illustrative' ? 'Illustrative values · not experimental measurements' : 'Values from the cited evidence'}</p>
    <svg viewBox="0 0 540 290" role="img" aria-labelledby={titleId} className="lecture-artifact-svg">
      <title id={titleId}>{spec.title}: {spec.xLabel} and {spec.yLabel}</title>
      <path d="M60 40V230H500" fill="none" stroke="#698b78"/>
      <line x1="60" x2="500" y1={baseline} y2={baseline} stroke="#385649"/>
      {[min, (min + max) / 2, max].map((value, index) => <text key={index} x="52" y={y(value) + 4} textAnchor="end" fill="#adc4b5" fontSize="10">{number(value)}</text>)}
      {spec.xValues.map((value, index) => (index % Math.max(1, Math.ceil(spec.xValues.length / 5)) === 0 || index === spec.xValues.length - 1) &&
        <text key={index} x={x(index)} y="250" textAnchor="middle" fill="#adc4b5" fontSize="10">{number(value)}</text>)}
      <text x="280" y="278" textAnchor="middle" fill="#adc4b5" fontSize="12">{spec.xLabel}</text>
      <text x="62" y="25" fill="#adc4b5" fontSize="12">{spec.yLabel}</text>
      {spec.series.map((series, index) => spec.chartType === 'line'
        ? <polyline key={series.label} points={series.values.map((value, i) => x(i) + ',' + y(value)).join(' ')} fill="none" stroke={colors[index]} strokeWidth="3"/>
        : <g key={series.label}>{series.values.map((value, i) => <rect key={i}
          x={x(i) - barWidth * spec.series.length / 2 + index * barWidth} y={Math.min(y(value), baseline)}
          width={Math.max(1, barWidth - 2)} height={Math.abs(y(value) - baseline)} fill={colors[index]}/>)}</g>)}
    </svg>
    <ul className="lecture-artifact-legend">{spec.series.map((series, index) => <li key={series.label} style={{ color: colors[index] }}>{series.label}</li>)}</ul>
    <details><summary>View chart data</summary><div className="lecture-artifact-table"><table>
      <thead><tr><th scope="col">{spec.xLabel}</th>{spec.series.map(series => <th key={series.label} scope="col">{series.label}</th>)}</tr></thead>
      <tbody>{spec.xValues.map((value, index) => <tr key={index}><th scope="row">{number(value)}</th>{spec.series.map(series => <td key={series.label}>{number(series.values[index])}</td>)}</tr>)}</tbody>
    </table></div></details>
  </>;
}

function Animation({ spec }) {
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep(current => {
      if (current >= spec.steps.length - 1) { setPlaying(false); return current; }
      return current + 1;
    }), 2500);
    return () => clearInterval(timer);
  }, [playing, spec.steps.length]);
  const position = id => {
    const index = spec.nodes.findIndex(node => node.id === id);
    return { x: 100 + index % 3 * 200, y: 65 + Math.floor(index / 3) * 115 };
  };
  return <>
    <svg viewBox={'0 0 600 ' + Math.max(160, Math.ceil(spec.nodes.length / 3) * 115 + 20)} role="img" aria-labelledby={titleId} className="lecture-artifact-svg">
      <title id={titleId}>{spec.title}, step {step + 1}: {spec.steps[step].title}</title>
      {spec.edges.map((edge, index) => {
        const from = position(edge.from), to = position(edge.to);
        return <g key={index}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#698b78" strokeDasharray="5 4"/>
          <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8} textAnchor="middle" fill="#adc4b5" fontSize="10">{edge.label}</text></g>;
      })}
      {spec.nodes.map(node => {
        const p = position(node.id), active = spec.steps[step].highlightNodeIds.includes(node.id);
        const lines = node.label.match(/.{1,22}(?:\s|$)|.{1,22}/g)?.slice(0, 3) ?? [node.label];
        return <g key={node.id} className={'lecture-animation-node' + (active ? ' active' : '')}>
          <rect x={p.x - 85} y={p.y - 35} width="170" height="70" rx="9" fill={active ? '#254a38' : '#121c17'} stroke={active ? '#b6f3d3' : '#698b78'} strokeWidth={active ? 2 : 1}/>
          <text x={p.x} y={p.y - (lines.length - 1) * 7} textAnchor="middle" fill="#e6ecea" fontSize="12">{lines.map((line, index) => <tspan key={index} x={p.x} dy={index ? 15 : 0}>{line.trim()}</tspan>)}</text>
        </g>;
      })}
    </svg>
    <div className="lecture-animation-controls">
      <button type="button" aria-label="Previous animation step" disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1); }}>Previous</button>
      <button type="button" onClick={() => { if (step === spec.steps.length - 1) setStep(0); setPlaying(!playing); }}>{playing ? 'Pause animation' : 'Play animation'}</button>
      <button type="button" aria-label="Next animation step" disabled={step === spec.steps.length - 1} onClick={() => { setPlaying(false); setStep(step + 1); }}>Next</button>
    </div>
    <p aria-live="polite" className="lecture-animation-caption"><strong>Step {step + 1} of {spec.steps.length}: {spec.steps[step].title}</strong><br/>{spec.steps[step].description}</p>
    <details><summary>Read all steps</summary><ol>{spec.steps.map((item, index) => <li key={index}>{item.title}: {item.description}</li>)}</ol></details>
  </>;
}

export function ArtifactVisual({ artifact, onSelectMoment }) {
  const { spec } = artifact;
  return <figure className="lecture-artifact-visual" aria-label={spec.title}>
    <figcaption><h3>{spec.title}</h3><small>{artifact.provider === 'fixture' ? 'Offline fixture visual' : artifact.model}</small><p>{spec.description}</p></figcaption>
    {spec.kind === 'chart' ? <Chart spec={spec}/> : <Animation spec={spec}/>}
    {spec.equations.map(equation => <Equation key={equation.expression} {...equation}/>)}
    <nav aria-label="Artifact sources">{artifact.citations.map(citation => <button key={citation.momentId} type="button" onClick={() => onSelectMoment?.(citation.momentId)}>{citation.label} · {citation.title} ↗</button>)}</nav>
  </figure>;
}
