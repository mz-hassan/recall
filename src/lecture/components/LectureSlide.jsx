import React from 'react';

export function LectureSlide({ slide, short, onOpen }) {
  const page = String(slide.page).padStart(2, '0');
  const possible = slide.confidence === 'low';
  if (slide.kind === 'pdf') return <a className="lecture-pdf-slide" href={slide.url} target="_blank" rel="noreferrer"
    aria-label={(possible ? 'Possible matching slide ' : 'Open original slide ') + slide.page + ' in PDF'}>
    <small>{possible ? 'POSSIBLE MATCH' : 'FROM THE LECTURE'} · SLIDE {page}</small>
    <strong>Read the original slide ↗</strong><span>Opens the source PDF at page {slide.page}.</span>
  </a>;
  return <button className="slide-frame" aria-label={'Expand original slide ' + slide.page} onClick={() => onOpen({ slide })}>
    <img src={slide.url} alt={(possible ? 'Possible matching lecture slide ' : 'Original lecture slide ') + slide.page + ': ' + short}/>
    <span className="caption"><span>{possible ? 'POSSIBLE MATCH' : 'FROM THE LECTURE'} · SLIDE {page}</span><span>EXPAND ↗</span></span>
  </button>;
}
