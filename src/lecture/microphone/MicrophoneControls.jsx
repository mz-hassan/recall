import React from 'react';

export function MicrophoneControls({ capture }) {
  return <div className="lecture-stream-status lecture-microphone-controls" aria-label="Microphone controls">
    <span role="status">{capture.listening ? '● Listening to your microphone' : capture.mode === 'starting' ? 'Loading speech model…' : capture.mode === 'finishing' ? 'Finishing queued audio…' : 'Microphone off'}</span>
    <meter min="0" max="1" value={capture.level} aria-label="Microphone audio level"/>
    {capture.listening ? <button onClick={capture.stop}>Stop listening</button> : <button disabled={capture.pending || capture.queued > 0 || capture.status?.installed === false} onClick={capture.start}>Start listening</button>}
    {capture.queued > 0 && <span>{capture.queued > 1 ? 'Catching up…' : 'Transcribing…'}</span>}
    {capture.error && <span role="alert">{capture.error}</span>}
    {capture.status?.installed === false && <span role="alert">Install the local speech model with scripts/install-speech.ps1.</span>}
  </div>;
}
