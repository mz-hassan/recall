import React, { useRef } from 'react';

function sectionPassage(bundle, section) {
  return bundle.passages.filter(p => p.page === section.page)
    .sort((a, b) => Math.abs((a.rects[0]?.y ?? 0) - section.y) - Math.abs((b.rects[0]?.y ?? 0) - section.y))[0];
}

export default function PaperOutline({ bundle, onNavigate, onSection, onSelect }) {
  const outline = useRef(null);
  function selectText() {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) return;
    const range = selected.getRangeAt(0);
    if (!outline.current.contains(range.commonAncestorContainer)) return;
    const quote = selected.toString().trim();
    if (!quote) return;
    const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const block = element.closest('[data-source-id]');
    const passage = bundle.passages.find(p => p.id === block?.dataset.sourceId) || bundle.highlights[0] || bundle.passages[0];
    if (!passage) return;
    onSelect({ page: passage.page, passageId: passage.id, quote: quote.slice(0, 6000), title: 'Selected from outline' }, range.getBoundingClientRect());
  }
  function citedItem(item) {
    return <li className="outline-bullet" key={item.title} data-source-id={item.citation}>
      <strong>{item.title}.</strong> {item.text} <button className="reading-source" aria-label={`View evidence for ${item.title}`} onClick={() => onNavigate(item.citation)}>View evidence ↗</button>
    </li>;
  }
  return <section ref={outline} className="reading-outline" aria-label="Paper outline" onMouseUp={selectText} onKeyUp={event => { if (event.shiftKey) selectText(); }}>
    <div className="outline-content">
      <div className="reading-eyebrow">YOUR READING GUIDE</div>
      <h2>The paper, one idea at a time.</h2>
      <p className="outline-intro">Open a section to explore. Select any text to ask about it.</p>
      <details className="outline-overview" data-source-id={bundle.ideas[0]?.citation || bundle.passages[0]?.id}>
        <summary><span>The big picture</span><small>Start here</small></summary>
        <div className="outline-detail"><p>{bundle.overview}</p><ul className="outline-bullets">{bundle.ideas.map(citedItem)}</ul></div>
      </details>
      <div className="outline-label">SECTIONS <span>{bundle.sections.length}</span></div>
      {bundle.sections.map(section => <details className="reading-section" key={section.id} data-source-id={sectionPassage(bundle, section)?.id}>
        <summary><span>{section.title}</span><small>p. {section.page}</small></summary>
        <div className="outline-detail">
          <p>{section.summary}</p>
          <button className="reading-source" onClick={() => onSection(section)}>View section in paper ↗</button>
          <ul className="outline-bullets">{section.topics.map(id => {
            const passage = bundle.highlights.find(h => h.id === id);
            return <li className="outline-bullet" key={id} data-source-id={id}>
              <strong>{passage.title}.</strong> <span>{passage.explanation}</span> <button className="reading-source" aria-label={`View ${passage.title} on page ${passage.page}`} onClick={() => onNavigate(id)}>View passage · p. {passage.page} ↗</button>
            </li>;
          })}</ul>
        </div>
      </details>)}
      <div className="outline-label">GO A LITTLE DEEPER</div>
      <details className="reading-section"><summary>Findings & limitations</summary><div className="outline-detail"><ul className="outline-bullets">{[...bundle.findings, ...bundle.limitations].map(citedItem)}</ul></div></details>
      {bundle.guidance.length > 0 && <details className="reading-section" data-source-id={bundle.passages[0]?.id}><summary>A suggested reading path</summary><div className="outline-detail"><ul className="outline-bullets">{bundle.guidance.map(g => <li className="outline-bullet" key={g}>{g}</li>)}</ul></div></details>}
    </div>
  </section>;
}
