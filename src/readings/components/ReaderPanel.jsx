import React, { useRef } from 'react';

export function ResizeHandle({ side, width, onResize }) {
  const drag = useRef(null);
  const change = value => onResize(Math.max(280, Math.min(900, value)));
  return <div className={`reading-resize ${side}`} role="separator" tabIndex={0}
    aria-label={`Resize ${side === 'left' ? 'paper' : 'chat'} panel`} aria-orientation="vertical"
    aria-valuemin={280} aria-valuemax={900} aria-valuenow={width}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current) change(drag.current.width + (event.clientX - drag.current.x) * (side === 'left' ? 1 : -1));
    }}
    onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') change(280);
      else if (event.key === 'End') change(900);
      else change(width + (event.key === 'ArrowRight' ? 40 : -40) * (side === 'left' ? 1 : -1));
    }}/>;
}

export function PanelRail({ side, onOpen, pages }) {
  const paper = side === 'left';
  return <button className={`reading-rail ${side}`} aria-label={paper ? 'Open paper' : 'Open chat'} aria-expanded={false} onClick={onOpen}>
    <span className="reading-rail-icon" aria-hidden="true">{paper ? '▤' : '✧'}</span>
    <span>{paper ? 'Paper' : 'Chat'}</span>
    <small>{paper ? `${pages} pages` : 'Ask anything'}</small>
    <span aria-hidden="true">{paper ? '→' : '←'}</span>
  </button>;
}
