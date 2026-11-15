import React, { useEffect, useState } from 'react';
import { renderPdfPage } from './pdfPages.js';

export function LectureSlide({ slide, short, onOpen }) {
  const pdf = slide.kind === 'pdf';
  // PDF-backed slides are drawn in the browser; the link card remains only as a fallback.
  const [rendered, setRendered] = useState({ key: null, url: null, failed: false });
  const key = slide.url + '|' + slide.page;
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    renderPdfPage(slide).then(
      url => { if (active) setRendered({ key, url, failed: false }); },
      () => { if (active) setRendered({ key, url: null, failed: true }); });
    return () => { active = false; };
  }, [pdf, key]);

  const page = String(slide.page).padStart(2, '0');
  const possible = slide.confidence === 'low';
  const label = (possible ? 'POSSIBLE MATCH' : 'FROM THE LECTURE') + ' · SLIDE ' + page;
  const current = rendered.key === key ? rendered : { url: null, failed: false };
  if (pdf && current.failed) return <a className="lecture-pdf-slide" href={slide.url} target="_blank" rel="noreferrer"
    aria-label={(possible ? 'Possible matching slide ' : 'Open original slide ') + slide.page + ' in PDF'}>
    <small>{label}</small>
    <strong>Read the original slide ↗</strong><span>Opens the source PDF at page {slide.page}.</span>
  </a>;
  const image = pdf ? current.url : slide.url;
  if (!image) return <div className="slide-frame slide-loading" role="status" aria-label={'Loading slide ' + slide.page}>
    <div className="slide-placeholder"/><span className="caption"><span>{label}</span><span>LOADING…</span></span>
  </div>;
  return <div className="slide-block">
    <button className="slide-frame" aria-label={'Expand original slide ' + slide.page} onClick={() => onOpen({ slide: { ...slide, url: image } })}>
      <img src={image} alt={(possible ? 'Possible matching lecture slide ' : 'Original lecture slide ') + slide.page + ': ' + short}/>
      <span className="caption"><span>{label}</span><span>EXPAND ↗</span></span>
    </button>
    {pdf && <a className="slide-source" href={slide.url} target="_blank" rel="noreferrer">Open in the PDF ↗</a>}
  </div>;
}
