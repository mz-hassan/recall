import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactFlow, Background, Controls, useReactFlow, useNodesInitialized, useStore } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';

function FitOnResize() {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const width = useStore(state => state.width), height = useStore(state => state.height);
  useEffect(() => {
    if (!ready || !width || !height) return;
    // Wait for React Flow's own measured viewport, including after a dialog opens.
    const frame = requestAnimationFrame(() => fitView({ padding: 0.18, maxZoom: 1.2, duration: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [fitView, ready, width, height]);
  return null;
}

function DiagramCanvas({ graph, onNavigate }) {
  return <div className="diagram-canvas" onKeyDown={event => {
    if (event.key !== 'Enter') return;
    const node = graph.nodes.find(n => n.id === event.target.closest('.react-flow__node')?.dataset.id);
    if (node) { event.preventDefault(); onNavigate(node.data.passageId); }
  }}><ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.15} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => onNavigate(node.data.passageId)} colorMode="dark">
    <Background/><Controls showInteractive={false} fitViewOptions={{ padding: 0.18, maxZoom: 1.2 }}/><FitOnResize/>
  </ReactFlow></div>;
}

export default function TeachingDiagram({ diagram, onNavigate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [dialogReady, setDialogReady] = useState(false);
  const dialog = useRef(null), expandButton = useRef(null);
  const graph = useMemo(() => {
    const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({})).setGraph({ rankdir: 'TB', ranksep: 65, nodesep: 40 });
    diagram.nodes.forEach(node => layout.setNode(node.id, { width: 205, height: Math.max(85, Math.ceil(node.label.length / 23) * 20 + 24) }));
    diagram.edges.forEach(edge => layout.setEdge(edge.from, edge.to));
    dagre.layout(layout);
    return {
      nodes: diagram.nodes.map(node => { const box = layout.node(node.id); return { id: node.id, data: { label: node.label, passageId: node.passageId }, position: { x: box.x - box.width / 2, y: box.y - box.height / 2 }, style: { width: box.width, height: box.height } }; }),
      edges: diagram.edges.map((edge, index) => ({ id: String(index), source: edge.from, target: edge.to, label: edge.label, markerEnd: { type: 'arrowclosed' } })),
    };
  }, [diagram]);
  useEffect(() => {
    if (!expanded) { setDialogReady(false); return; }
    dialog.current.showModal();
    setDialogReady(true);
    return () => expandButton.current?.focus({ preventScroll: true });
  }, [expanded]);
  function navigate(id) { setExpanded(false); onNavigate(id); }
  return <div className="teaching-diagram">
    <div className="diagram-heading"><small>CONCEPT DIAGRAM</small><div><button ref={expandButton} aria-label="Expand diagram" onClick={() => setExpanded(true)}>⤢</button><button aria-label="Remove diagram" onClick={onRemove}>×</button></div></div>
    <h4>{diagram.title}</h4><p>{diagram.description}</p>
    <DiagramCanvas graph={graph} onNavigate={onNavigate}/>
    <details><summary>Text explanation & sources</summary><ol>{diagram.nodes.map(node => <li key={node.id}><button onClick={() => onNavigate(node.passageId)}>{node.label} ↗</button></li>)}</ol><ul>{diagram.edges.map((edge, index) => <li key={index}>{diagram.nodes.find(node => node.id === edge.from)?.label} → {diagram.nodes.find(node => node.id === edge.to)?.label}{edge.label ? `: ${edge.label}` : ''}</li>)}</ul></details>
    {expanded && createPortal(<dialog ref={dialog} className="diagram-dialog" aria-label={diagram.title} onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setExpanded(false); } }}>
      <div className="diagram-dialog-heading"><div><small>CONCEPT DIAGRAM</small><h2>{diagram.title}</h2></div><button autoFocus aria-label="Close expanded diagram" onClick={() => setExpanded(false)}>×</button></div>
      <p>{diagram.description}</p>{dialogReady && <DiagramCanvas graph={graph} onNavigate={navigate}/>}<small>Click a node to read its source in the paper.</small>
    </dialog>, document.body)}
  </div>;
}
