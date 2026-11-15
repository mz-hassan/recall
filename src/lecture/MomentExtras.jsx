import React from 'react';
import { Equation } from './components/Equation.jsx';
import { MomentArtifacts } from './components/MomentArtifacts.jsx';
import { BehaviorCloningVisual } from './components/artifacts/BehaviorCloningVisual.jsx';

export function MomentExtras({ moment, client, runId, onSelectMoment }) {
  return <>
    <BehaviorCloningVisual momentId={moment.id}/>
    {moment.equations.map(equation => <Equation key={equation.expression} {...equation}/>)}
    {moment.graph && <div className="intuition">
      <small>TOPIC DIAGRAM · {moment.graph.origin.toUpperCase()}</small>
      <ul className="topic-diagram" aria-label="Topic relationships">
        {moment.graph.edges.map(edge => <li key={edge.id}>
          <strong>{moment.graph.nodes.find(node => node.id === edge.from)?.label}</strong>
          <span>{edge.relation} →</span>
          <strong>{moment.graph.nodes.find(node => node.id === edge.to)?.label}</strong>
        </li>)}
      </ul>
    </div>}
    <MomentArtifacts moment={moment} client={client} runId={runId} onSelectMoment={onSelectMoment}/>
  </>;
}
