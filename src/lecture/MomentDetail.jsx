import React from 'react';
import { MomentExtras } from './MomentExtras.jsx';
import { LectureSlide } from './components/LectureSlide.jsx';
import { summaryCopy, summaryFailed } from './summaryCopy.js';

export function MomentDetail({ moment, saved, onSave, onOpen, onChat, chatEnabled, client, runId, onSelectMoment, doubtAction, slideContent }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    {moment.headline ? <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/> : <p className="chunk-copy">{summaryCopy(moment)}</p>}
    {(moment.enrichment === 'pending' || moment.enrichment === 'none') && <p className="lecture-stream-note" role="status">{moment.summary ? 'Updating the topic summary…' : 'Filling in notes…'}</p>}
    {moment.enrichment === 'failed' && <p className="lecture-stream-note" role="status">{moment.summary ? 'Could not update the summary. The last summary is kept; the transcript fallback is available.' : 'Could not load the summary. The transcript fallback is available.'}</p>}
    {onChat && <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" onClick={onChat}>Ask about this <span>↗</span><small>{chatEnabled ? 'LECTURE CHAT' : 'PREVIEW'}</small></button>
    </div>}
    {slideContent ?? moment.slides.map(slide => <LectureSlide key={slide.page + '/' + slide.url} slide={slide} short={moment.short} onOpen={onOpen}/>)}
    {moment.intuition && <div className="intuition"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>}
    <MomentExtras moment={moment} client={client} runId={runId} onSelectMoment={onSelectMoment}/>
    <div className="detail-actions">{summaryFailed(moment) && <button onClick={() => onOpen('transcript')}>Read transcript fallback ↗</button>}{onSave && <button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button>}</div>
    {doubtAction}
    <p className="notes">{moment.timeSource === 'simulated' || (!moment.timeSource && moment.type === 'TRANSCRIPT') ? 'Time reflects simulated playback.' : moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
  </>;
}
