import React, { Children, useLayoutEffect, useRef } from 'react';

export function Brand({ href, lecture = false }) {
  return <a href={href} className="brand" aria-label={lecture ? 'Recall home' : undefined}>
    <svg width="29" height="29" viewBox="0 0 32 32" fill="none"><path d="M24 8C15-3 0 9 9 21M9 21V11M9 21H19M8 24C17 35 32 23 23 11M23 11V21M23 11H13" stroke="currentColor" strokeWidth="1.6"/></svg>
    recall{lecture && <span> / </span>}
  </a>;
}

export function Dialog({ children, onClose, lecture = false, wide = false }) {
  const ref = useRef(null);
  const open = Children.toArray(children).length > 0;
  useLayoutEffect(() => {
    if (open) ref.current.showModal();
    else ref.current.close();
  }, [open]);
  return <dialog ref={ref} id={lecture ? 'modal' : 'dialog'} className={wide ? 'wide' : undefined}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
    }}>
    <button id={lecture ? 'closeModal' : 'closeDialog'} className={lecture ? undefined : 'close'} aria-label="Close dialog" onClick={onClose}>✕</button>
    <div id={lecture ? 'modalContent' : 'dialogBody'}>{children}</div>
  </dialog>;
}
