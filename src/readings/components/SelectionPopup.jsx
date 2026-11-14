import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function SelectionPopup({ selection, onExplain, onDismiss }) {
  const popup = useRef(null);
  useEffect(() => {
    const outside = event => { if (!popup.current?.contains(event.target)) onDismiss(); };
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onDismiss(); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [onDismiss]);
  const { bounds, context } = selection;
  const left = Math.max(12, Math.min(bounds.left, window.innerWidth - 200));
  const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 64));
  return createPortal(<div ref={popup} className="reading-selection-popup" style={{ left, top }} role="toolbar" aria-label="Selected text actions">
    <button aria-label="Explain" onMouseDown={event => event.preventDefault()} onClick={() => onExplain(context)}>✧ Explain</button>
    <span>p. {context.page}</span>
    <button aria-label="Dismiss selection popup" onClick={onDismiss}>×</button>
  </div>, document.body);
}
