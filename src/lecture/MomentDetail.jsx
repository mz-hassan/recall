import React from 'react';
import { MomentExtras } from './MomentExtras.jsx';

const slideNumber = slide => String(slide.page).padStart(2, '0');

export function MomentDetail({ moment, saved, onSave, onOpen, onChat, doubtAction }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    {moment.headline ? <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/> : <p className="chunk-copy">{moment.summary || moment.quote}</p>}
    {onChat && <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" onClick={onChat}>Ask about this <span>↗</span><small>PREVIEW</small></button>
    </div>}
    {moment.slides.map(slide => <button key={slide.page} className="slide-frame" aria-label={'Expand original slide ' + slide.page} onClick={() => onOpen({ slide })}>
      <img src={slide.url} alt={'Original lecture slide ' + slide.page + ': ' + moment.short}/>
      <span className="caption"><span>FROM THE LECTURE · SLIDE {slideNumber(slide)}</span><span>EXPAND ↗</span></span>
    </button>)}
    {moment.intuition && <div className="intuition"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>}
    <MomentExtras moment={moment}/>
    <div className="detail-actions"><button onClick={() => onOpen('transcript')}>Read the source ↗</button>{onSave && <button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button>}</div>
    {doubtAction}
    <p className="notes">{moment.type === 'TRANSCRIPT' ? 'Time reflects simulated playback.' : moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
  </>;
}

