import React from 'react';

export function MomentExtras({ moment }) {
  return <>
    {moment.equations.map(equation => <div className="intuition" key={equation.expression}>
      <small>EQUATION</small><p><code>{equation.expression}</code></p><p>{equation.explanation}</p>
    </div>)}
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
    <div className="detail-actions">
      {moment.artifacts.map(artifact => <a key={artifact.id} href={artifact.url} target="_blank" rel="noreferrer">{artifact.title} ↗</a>)}
      <button disabled>Request an artifact · Coming soon</button>
    </div>
  </>;
}

export function MomentChat({ moment, onClose }) {
  return <aside className="moment-chat" aria-label="Lecture side chat">
    <div className="eyebrow">SIDE CHAT <button onClick={onClose} aria-label="Close side chat">✕</button></div>
    <h2>Ask about this moment</h2>
    <p>{moment.short} · {moment.label}</p>
    <input aria-label="Ask a question about this topic" placeholder="Ask a question about this topic…"/>
    <button disabled>Send · Coming soon</button>
  </aside>;
}
