import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { relativeRect } from '../state.js';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export function PdfReader({ paper, bundle, annotations, showHighlights, onSelect, onPage, navigation, initialPage, onVerified }) {
  const scroll = useRef(null), resizeAnchor = useRef(null), lastWidth = useRef(0);
  const [width, setWidth] = useState(700), [zoom, setZoom] = useState(1), [loaded, setLoaded] = useState(false), [verified, setVerified] = useState(false), [error, setError] = useState('');
  const onPageRef = useRef(onPage); onPageRef.current = onPage;
  const visibleAnchor = () => {
    const el = scroll.current;
    if (!el) return null;
    const top = el.getBoundingClientRect().top + 24;
    const page = [...el.querySelectorAll('[data-pdf-page]')].find(p => p.getBoundingClientRect().bottom > top);
    return page && { page: Number(page.dataset.pdfPage), offset: (top - page.getBoundingClientRect().top) / page.getBoundingClientRect().height };
  };
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.width) return; // A collapsed panel retains its last viewport.
      const next = Math.max(260, Math.floor(entry.contentRect.width - 40));
      if (next === lastWidth.current) return;
      resizeAnchor.current = visibleAnchor(); lastWidth.current = next; setWidth(next);
    });
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);
  function go(page, fraction = 0, inset = 12) {
    const parent = scroll.current, el = parent?.querySelector(`[data-pdf-page="${page}"]`);
    if (!el) return;
    parent.scrollTop += el.getBoundingClientRect().top - parent.getBoundingClientRect().top + fraction * el.getBoundingClientRect().height - inset;
  }
  useLayoutEffect(() => {
    const anchor = resizeAnchor.current;
    if (anchor) { resizeAnchor.current = null; go(anchor.page, anchor.offset, 24); }
  }, [width, zoom]);
  useEffect(() => { if (loaded && navigation) go(navigation.page, navigation.y || 0); }, [navigation, loaded]);
  useEffect(() => { if (loaded && !navigation) go(initialPage); }, [loaded]);
  useEffect(() => {
    if (!loaded) return;
    const handle = () => { const a = visibleAnchor(); if (a) onPageRef.current(a.page); };
    const el = scroll.current; el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [loaded]);
  function selection() {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    if (!scroll.current.contains(range.commonAncestorContainer)) return;
    const quote = selected.toString().trim();
    if (!quote) return;
    const regions = [];
    for (const page of scroll.current.querySelectorAll('[data-pdf-page]')) {
      const bounds = page.getBoundingClientRect();
      for (const r of range.getClientRects()) {
        const rect = relativeRect(r, bounds);
        if (rect && r.width > 1 && r.height > 1) regions.push({ page: Number(page.dataset.pdfPage), ...rect });
      }
    }
    if (regions.length) onSelect({ page: regions[0].page, endPage: regions.at(-1).page, quote: quote.slice(0, 6000), title: 'Selected passage', regions }, range.getBoundingClientRect());
  }
  function clicked(event, page) {
    if (window.getSelection()?.toString().trim() || !verified || !showHighlights) return;
    const r = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height;
    const hit = annotations.find(a => a.page === page && a.rects.some(b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height));
    if (hit) onSelect({ page, passageId: hit.passageId || hit.id, quote: hit.quote, title: hit.title || 'Teacher annotation', explanation: hit.explanation }, { left: event.clientX, bottom: event.clientY });
  }
  return <div className="paper-document">
    <div className="paper-pdf-tools"><span>Original PDF · {bundle.pageCount} pages</span><div><button aria-label="Zoom out" disabled={zoom <= .6} onClick={() => { resizeAnchor.current = visibleAnchor(); setZoom(z => z - .1); }}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => { resizeAnchor.current = visibleAnchor(); setZoom(z => z + .1); }}>+</button><button onClick={() => { resizeAnchor.current = visibleAnchor(); setZoom(1); }}>Fit</button></div></div>
    {error && <div className="reading-alert" role="alert">{error} <a href={paper.originalUrl} target="_blank" rel="noreferrer">Open original ↗</a></div>}
    <div className="paper-scroll" ref={scroll} onMouseUp={selection} onKeyUp={event => { if (event.shiftKey) selection(); }}>
      <Document suspense={false} file={paper.pdfUrl} onLoadSuccess={pdf => { const valid = pdf.fingerprints[0] === bundle.fingerprint; setVerified(valid); onVerified?.(valid); setLoaded(true); if (!valid) setError('This PDF differs from the prepared edition. Highlights are hidden.'); }} onLoadError={() => setError('The PDF could not be loaded.')} loading={<div className="paper-loading" role="status"><p>Opening the paper…</p><progress aria-label="Loading PDF"/></div>}>
        {Array.from({ length: bundle.pageCount }, (_, i) => i + 1).map(page => <div key={page} className="paper-pdf-page" data-pdf-page={page} style={{ width: width * zoom, height: width * zoom * bundle.pageSizes[page - 1].height / bundle.pageSizes[page - 1].width }} onClick={e => clicked(e, page)}>
          <Page suspense={false} pageNumber={page} width={width * zoom} onRenderSuccess={() => { const el = scroll.current?.querySelector(`[data-pdf-page="${page}"]`); if (el) el.dataset.renderedWidth = String(width * zoom); }} renderTextLayer renderAnnotationLayer />
          {verified && showHighlights && <div className="paper-highlights" aria-hidden="true">{annotations.filter(a => a.page === page).flatMap(a => a.rects.map((r, i) => <div key={`${a.id}-${i}`} className={`paper-highlight ${a.kind} ${a.temporary ? 'temporary' : ''}`} style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%' }}/>))}</div>}
        </div>)}
      </Document>
    </div>
  </div>;
}
