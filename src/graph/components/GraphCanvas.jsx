import React, { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { relationLabel } from '../filter.js';

export function GraphCanvas({ graph, visibleGraph = graph, selected, changes, onSelect }) {
  const container = useRef(null);
  const instance = useRef(null);
  const select = useRef(onSelect);
  const view = useRef(visibleGraph);
  const hasDrawn = useRef(false);
  const lastView = useRef('');
  select.current = onSelect;
  view.current = visibleGraph;
  function moveViewport(cy, target, animate) {
    cy.stop(true, false);
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cy.animate(target, { duration: 450, easing: 'ease-in-out-cubic' });
    } else { cy.viewport(target); }
  }
  function fitGraph(cy, animate = false) {
    if (!cy || !view.current.nodes.length) return;
    const ids = new Set([...view.current.nodes, ...view.current.edges].map(item => item.id));
    const elements = cy.elements().filter(element => ids.has(element.id()));
    if (!elements.nodes().length) return;
    const narrow = cy.width() < 480;
    const padding = narrow ? 18 : 38;
    const bounds = elements.boundingBox({ includeLabels: true, includeOverlays: false });
    const maximum = narrow ? 1.15 : 1.25;
    const zoom = Math.max(cy.minZoom(), Math.min(maximum, (cy.width() - 2 * padding) / Math.max(bounds.w, 1), (cy.height() - 2 * padding) / Math.max(bounds.h, 1)));
    moveViewport(cy, { zoom, pan: {
      x: cy.width() / 2 - (bounds.x1 + bounds.x2) / 2 * zoom,
      y: cy.height() / 2 - (bounds.y1 + bounds.y2) / 2 * zoom - (narrow ? 20 : 0),
    } }, animate);
  }
  function zoomGraph(factor) {
    const cy = instance.current;
    if (!cy) return;
    const zoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor));
    const center = { x: cy.width() / 2, y: cy.height() / 2 };
    moveViewport(cy, { zoom, pan: {
      x: center.x - (center.x - cy.pan('x')) / cy.zoom() * zoom,
      y: center.y - (center.y - cy.pan('y')) / cy.zoom() * zoom,
    } }, true);
  }
  function arrangeGraph(cy) {
    const narrow = cy.width() < 480;
    cy.style().selector('node').style({
      width: narrow ? 128 : 156, height: narrow ? 72 : 68,
      'text-max-width': narrow ? 112 : 140,
    }).selector('edge').style('text-max-width', narrow ? 44 : 80).update();
    if (cy.nodes().length <= 12) {
      // Keep related topics next to one another in a stable, compact layout.
      const order = [];
      const visited = new Set();
      const visit = node => {
        if (visited.has(node.id())) return;
        visited.add(node.id()); order.push(node);
        node.neighborhood().nodes().sort((a, b) => a.data('label').localeCompare(b.data('label'))).forEach(visit);
      };
      cy.nodes().sort((a, b) => a.degree() - b.degree() || a.data('label').localeCompare(b.data('label'))).forEach(visit);
      const positions = new Map();
      const columns = Math.min(narrow ? 2 : 3, order.length);
      order.forEach((node, index) => {
        const row = Math.floor(index / columns);
        // A winding order keeps successive connected cards adjacent, including
        // at row breaks. Gaps reserve room for relationship labels.
        const column = row % 2 ? columns - 1 - index % columns : index % columns;
        positions.set(node.id(), { x: column * (narrow ? 204 : 248), y: row * (narrow ? 142 : 176) });
      });
      cy.layout({ name: 'preset', positions: node => positions.get(node.id()), fit: false, animate: false }).run();
    } else {
      cy.layout({ name: 'cose', animate: false, fit: false, nodeDimensionsIncludeLabels: true,
        nodeRepulsion: () => 4500, nodeOverlap: 24, idealEdgeLength: () => 95,
        componentSpacing: 60, numIter: 1000, randomize: true,
      }).run();
    }
  }
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cy = cytoscape({ container: container.current,
      elements: [],
      style: [
        { selector: 'node, edge', style: { 'transition-property': 'opacity', 'transition-duration': motion.matches ? '0ms' : '180ms' } },
        { selector: 'node', style: { label: 'data(label)', shape: 'roundrectangle', 'background-color': '#183328', color: '#e0ebe4', 'font-family': 'system-ui, sans-serif', 'font-weight': 500, 'font-size': 14, 'line-height': 1.25, 'text-valign': 'center', 'text-halign': 'center', width: 156, height: 68, padding: 8, 'text-wrap': 'wrap', 'text-max-width': 140, 'border-width': 1.5, 'border-color': '#587f6b' } },
        { selector: 'edge', style: { width: 1.2, 'line-color': '#355345', 'target-arrow-color': '#355345', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.65 } },
        { selector: '.cg-new', style: { 'background-color': '#342e1d', 'border-color': '#c9aa61', 'line-color': '#b99b51', 'target-arrow-color': '#b99b51' } },
        { selector: '.cg-focus', style: { 'background-color': '#244c3a', 'border-color': '#b6f3d3', 'border-width': 2.5 } },
        { selector: 'edge.cg-connected', style: { label: 'data(label)', color: '#d4e9dd', 'font-size': 11, 'text-wrap': 'wrap', 'text-background-color': '#0d1611', 'text-background-opacity': 1, 'text-background-padding': '4px', 'text-background-shape': 'roundrectangle', 'line-color': '#98d0b1', 'target-arrow-color': '#98d0b1', width: 2 } },
        { selector: 'node.cg-dim', style: { opacity: 0.55 } },
        { selector: 'edge.cg-dim', style: { opacity: 0.2 } },
        { selector: 'node.cg-filtered, edge.cg-filtered', style: { opacity: 0, events: 'no' } },
      ],
      layout: { name: 'preset', fit: false },
      minZoom: 0.12, maxZoom: 3, wheelSensitivity: 0.2,
    });
    instance.current = cy;
    cy.on('tap', 'node', event => select.current(event.target.id()));
    cy.on('tap', event => { if (event.target === cy) select.current(''); });
    cy.on('grab dragpan scrollzoom pinchzoom', () => cy.stop(true, false));
    const onMotionChange = () => {
      cy.style().selector('node, edge').style('transition-duration', motion.matches ? '0ms' : '180ms').update();
      if (motion.matches) fitGraph(cy);
    };
    motion.addEventListener('change', onMotionChange);
    let width = cy.width(), height = cy.height(), frame;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        cy.resize();
        if (cy.width() !== width || cy.height() !== height) {
          width = cy.width(); height = cy.height(); arrangeGraph(cy); fitGraph(cy);
        }
      });
    });
    resize.observe(container.current);
    return () => { resize.disconnect(); cancelAnimationFrame(frame); motion.removeEventListener('change', onMotionChange); cy.destroy(); instance.current = null; };
  }, []);
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    const ids = new Set([...graph.nodes, ...graph.edges].map(item => item.id));
    cy.batch(() => {
      cy.elements().filter(element => !ids.has(element.id())).remove();
      for (const node of graph.nodes) {
        let element = cy.getElementById(node.id);
        if (!element.length) element = cy.add({ data: { id: node.id, label: node.label } });
        else element.data('label', node.label);
        element.toggleClass('cg-new', changes.nodes.includes(node.id));
      }
      for (const edge of graph.edges) {
        let element = cy.getElementById(edge.id);
        if (!element.length) element = cy.add({ data: { id: edge.id, source: edge.from, target: edge.to, label: relationLabel(edge.relation) } });
        else element.data('label', relationLabel(edge.relation));
        element.toggleClass('cg-new', changes.edges.includes(edge.id));
      }
    });
    arrangeGraph(cy);
    lastView.current = '';
  }, [graph, changes]);
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    const ids = new Set([...visibleGraph.nodes, ...visibleGraph.edges].map(item => item.id));
    cy.batch(() => cy.elements().forEach(element => element.toggleClass('cg-filtered', !ids.has(element.id()))));
    const signature = JSON.stringify([...ids]);
    if (signature !== lastView.current) {
      if (visibleGraph.nodes.length) fitGraph(cy, hasDrawn.current);
      else cy.stop(true, false);
      lastView.current = signature;
    }
    hasDrawn.current = true;
  }, [graph, visibleGraph]);
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    cy.elements().removeClass('cg-focus cg-connected cg-dim');
    const node = cy.getElementById(selected || '');
    if (node.length) {
      node.addClass('cg-focus');
      node.connectedEdges().addClass('cg-connected');
      cy.elements().difference(node.closedNeighborhood()).addClass('cg-dim');
    }
  }, [graph, selected]);
  return <div className="cg-canvas-shell">
    <div className="cg-canvas" ref={container} role="img" aria-label="Interactive course concept graph. Drag to pan, scroll to zoom. Use the concept and connection lists below for keyboard access."/>
    <div className="cg-zoom" aria-label="Graph view controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoomGraph(1.25)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomGraph(1 / 1.25)}>−</button>
      <button type="button" onClick={() => fitGraph(instance.current, true)}>Fit</button>
    </div>
    <span className="cg-canvas-hint">Drag to explore · Scroll to zoom · Select a concept</span>
  </div>;
}
