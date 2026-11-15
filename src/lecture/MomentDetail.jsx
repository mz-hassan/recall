import React, { Fragment } from 'react';
import { Equation } from './components/Equation.jsx';
import './momentDetail.css';
import { MomentExtras } from './MomentExtras.jsx';
import { LectureSlide } from './components/LectureSlide.jsx';
import { summaryCopy, summaryFailed } from './summaryCopy.js';

export function MomentDetail({ moment, saved, onSave, onOpen, onChat, chatEnabled, client, runId, onSelectMoment, doubtAction, slideContent, onQuiz }) {
  return <>
    <div className="eyebrow">{moment.label} &nbsp; / &nbsp; {moment.type}</div>
    <h2>{moment.title}</h2>
    {moment.headline ? <p className="summary" dangerouslySetInnerHTML={{ __html: moment.summary }}/> : <p className="chunk-copy">{summaryCopy(moment)}</p>}
    {(moment.enrichment === 'pending' || moment.enrichment === 'none') && <p className="lecture-stream-note" role="status">{moment.summary ? 'Updating the topic summary…' : 'Filling in notes…'}</p>}
    {moment.enrichment === 'failed' && <p className="lecture-stream-note" role="status">{moment.summary ? 'Could not update the summary. The last summary is kept; the transcript fallback is available.' : 'Could not load the summary. The transcript fallback is available.'}</p>}
    {onChat && <div className="context-chat"><div><span className="chat-spark">✧</span><span>Stay with this idea<small>Ask with this moment as context</small></span></div>
      <button type="button" onClick={onChat}>Ask about this <span>↗</span><small>{chatEnabled ? 'LECTURE CHAT' : 'PREVIEW'}</small></button>
    </div>}
    {slideContent ?? moment.slides.map(slide => <Fragment key={slide.page + '/' + slide.url}>
      <LectureSlide slide={slide} short={moment.short} onOpen={onOpen}/>
      {slide.equationNotes?.length > 0 && <section className="slide-equation-notes" aria-label={'Slide ' + slide.page + ' equation breakdown'}>
        <h3>Slide {slide.page} · Equation breakdown</h3>
        {slide.equationNotes.map(equation => <Equation key={equation.expression} {...equation}/>)}
      </section>}
    </Fragment>)}
    {moment.intuition && <div className="intuition moment-takeaway"><small>THE IDEA TO HOLD ONTO</small><p>{moment.intuition}</p></div>}
    <MomentExtras moment={moment} client={client} runId={runId} onSelectMoment={onSelectMoment}/>
    <div className="detail-actions">{(moment.headline || summaryFailed(moment)) && <button onClick={() => onOpen('transcript')}>{moment.headline ? 'Read the source ↗' : 'Read transcript fallback ↗'}</button>}{onSave && <button onClick={onSave}>{saved ? '✓ Moment saved' : '+ Save this moment'}</button>}</div>
    {doubtAction}
    {onQuiz && <div className="detail-actions"><button type="button" onClick={onQuiz}>Take a topic quiz ↗</button></div>}
    <p className="notes">{moment.timeSource === 'simulated' || (!moment.timeSource && moment.type === 'TRANSCRIPT') ? 'Time reflects simulated playback.' : moment.label.startsWith('≈') ? 'Estimated timestamp within an untimed transcript passage.' : 'Timestamp anchored to the lecture transcript.'}</p>
  </>;
}
