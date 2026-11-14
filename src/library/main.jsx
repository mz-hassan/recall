import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Dialog } from '../ui.jsx';
import { readStored, readPdf, storePdf } from '../storage.js';
import { baseCourses, baseSources } from './content.js';
import './library.css';

const date = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const number = lecture => lecture.id.padStart(2, '0');
const lecturePath = (course, lecture) => '#lecture/' + course.id + '/' + lecture.id;
const kinds = ['Slides', 'Required', 'Optional'];

function Art({ vision }) {
  return <div className="orb" aria-hidden="true"><svg viewBox="0 0 260 260">
    {vision ? <><path d="M42 42h176v176H42zM64 64h132v132H64zM87 87h86v86H87z" fill="none" strokeWidth=".8"/><circle cx="130" cy="130" r="24"/></> :
      <><ellipse cx="130" cy="130" rx="94" ry="44" transform="rotate(35 130 130)"/><ellipse cx="130" cy="130" rx="94" ry="44" transform="rotate(-35 130 130)"/><circle cx="130" cy="130" r="67"/><circle cx="130" cy="130" r="6" className="star"/></>}
  </svg></div>;
}

function Courses({ courses, getSources, onNew }) {
  return <>
    <div className="hero"><div><div className="eyebrow">YOUR LEARNING SPACE</div><h1>Pick up a <em>thread.</em></h1><p className="intro">Every course is a world of connected ideas.<br/>Choose one. We’ll keep the pieces together.</p></div><button className="secondary" onClick={onNew}>+ New course</button></div>
    <div className="subhead"><span>YOUR COURSES</span><small>{courses.length} spaces · Fall semester</small></div>
    <div className="course-grid">{courses.map(course => <a key={course.id} href={'#course/' + course.id} className={'course-card' + (course.id === 'cv' ? ' vision' : '')}>
      <Art vision={course.id === 'cv'}/><div className="code">{course.code}</div><h2>{course.name}</h2><p>{course.description || 'A new space for your lectures and materials.'}</p>
      <div className="card-bottom"><span>{course.lectures.length} lectures</span><span>{getSources(course.id).length} sources</span><b>↗</b></div>
    </a>)}</div>
    <div className="library-note"><span>✧ &nbsp; Your ideas don’t live in isolation.</span><span>Start with a course. Add its sources.<br/>Let the connections grow.</span></div>
  </>;
}

function CourseHeading({ course, sourceCount, active, onAdd, onRecord }) {
  return <>
    <a className="back" href="#courses">← All courses</a>
    <div className="hero course-hero"><div><div className="eyebrow">{course.code} &nbsp; / &nbsp; FALL 2026</div><h1>{course.name}<em>.</em></h1><p className="intro">{course.teacher || 'Your course workspace'} · {course.lectures.length} lectures in your library</p></div>
    <div className="hero-actions"><button className="secondary" onClick={() => onAdd()}>+ Add sources</button><button className="primary" onClick={() => onRecord()}>◉ Start a session</button></div></div>
    <nav className="tabs"><a className={active === 'course' ? 'active' : ''} href={'#course/' + course.id}>Overview &amp; lectures <small>{course.lectures.length}</small></a><a className={active === 'sources' ? 'active' : ''} href={'#sources/' + course.id}>Sources <small>{sourceCount}</small></a></nav>
  </>;
}

function ReplayCard({ overview }) {
  return <div className="continue"><div className="number">{overview ? '02' : '↝'}</div><div className="resume-text">
    <div className="eyebrow"><i/> {overview ? 'CURRENT DEMO LECTURE' : 'THE THREAD IS READY'}</div><h2>{overview ? 'When imitation fails.' : 'Rewind through the ideas.'}</h2>
    <p>{overview ? 'DAgger · 7 moments · Original slides & transcript excerpts' : 'Distribution shift → compounding errors → DAgger → recovery'}</p>
  </div><a className={overview ? 'primary' : 'secondary'} href="lecture.html">{overview ? 'Enter the thread ↗' : 'Resume at 33:10 ↗'}</a></div>;
}

function CourseOverview({ course, getSources }) {
  const isAI = course.id === 'ai';
  return <>
    {isAI && <ReplayCard overview/>}
    {course.lectures.length > 0 && <section className="course-story"><div className="story-heading">
      <div className="eyebrow">THE BIGGER PICTURE</div>
      <h2>{isAI ? <>From copying actions<br/>to understanding behavior.</> : <>From the world<br/>to the image.</>}</h2>
      <p>{isAI ? 'An editorial overview of this three-lecture collection. Each lecture gives the next one its starting point.' : 'Your first three lectures, connected by the questions they explore.'}</p>
    </div><div className="story-thread">{course.lectures.map(lecture => <a key={lecture.id} href={lecturePath(course, lecture)}>
      <span className={'story-dot' + (lecture.replay ? ' ready' : '')}/><small>{number(lecture)} · {date(lecture.date)}</small><h3>{lecture.subtitle || lecture.title}</h3><p>{lecture.title}</p><span className="story-arrow">↗</span>
    </a>)}</div></section>}
    <div className="subhead"><span>THE LECTURE COLLECTION</span><small>Titles and dates from your course library</small></div>
    {course.lectures.length ? <div className="lecture-list">{course.lectures.map(lecture => <a key={lecture.id} href={lecturePath(course, lecture)} className="lecture-row">
      <span className="lecture-number">{number(lecture)}</span><div><h3>{lecture.title}</h3><p>{lecture.subtitle} · {getSources(course.id, lecture.id).filter(s => s.lecture !== 'all').length} lecture sources</p></div>
      <time>{date(lecture.date)}, 2026</time><span className={'badge' + (lecture.replay ? '' : ' dim')}>{lecture.replay ? <><i className="dot"/> Replay ready</> : 'Placeholder'}</span><span className="arrow">↗</span>
    </a>)}</div> : <div className="empty-state">Your first thread starts here. Add course sources, then preview a session.</div>}
    <div className="source-preview"><div><b>One course. A shared foundation.</b><p>Course links and PDFs stay connected to the lectures they belong to.</p></div><a href={'#sources/' + course.id}>Explore {getSources(course.id).length} sources ↗</a></div>
  </>;
}

function SourceList({ sources, course, onPdf, onRemove }) {
  if (!sources.length) return <div className="empty-state">No sources in this view yet. Add a PDF or course link.</div>;
  return <div className="source-list">{sources.map(source => {
    const lecture = course.lectures.find(item => item.id === source.lecture);
    const association = lecture ? 'Lecture ' + lecture.id + ' · ' + lecture.title : source.lecture === 'all' ? 'Course-wide' : 'Lecture ' + source.lecture;
    return <article key={source.id} className="source-row">
      <div className="source-type">{source.pdf || source.file ? 'PDF' : 'LINK'}</div>
      <div className="source-body"><h3>{source.title}</h3><p>{source.kind} · {association}</p>
        <p>{source.file ? 'Saved in this browser · Assigned by you' : source.pdf ? 'Bundled PDF · Matched to local index' : source.custom ? 'Awaiting ingestion · URL format checked' : 'Reference link · Not crawled'}</p>
        {source.url && <a href={source.url} target="_blank" rel="noopener noreferrer">{new URL(source.url).hostname} ↗</a>}
      </div><div className="source-actions">
        {source.pdf || source.file ? <button onClick={() => onPdf(source)}>Open ↗</button> : <a href={source.url} target="_blank" rel="noopener noreferrer">Visit ↗</a>}
        {source.custom && <button aria-label={'Remove ' + source.title} onClick={() => onRemove(source.id)}>×</button>}
      </div>
    </article>;
  })}</div>;
}

function DropZone({ quick = false, onFile }) {
  const [dragging, setDragging] = useState(false);
  return <label className={'drop-zone' + (dragging ? ' dragover' : '')} onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)} onDrop={event => {
      event.preventDefault(); setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) onFile(file);
    }}>
    <div className="upload-symbol">↥</div><strong>{quick ? 'Drop a PDF here' : 'Drop your PDF here'}</strong><p>{quick ? 'or choose a file · up to 25 MB' : 'or choose a file · PDF only · 25 MB maximum'}</p>
    <input type="file" accept="application/pdf,.pdf" aria-label={quick ? 'Choose course PDF' : 'Choose PDF'} onChange={event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (file) onFile(file);
    }}/>
  </label>;
}

function CourseSources({ course, sources, onAdd, onLink, ...actions }) {
  const [filter, setFilter] = useState('All');
  return <div className="sources-layout"><section>
    <div className="source-toolbar"><div className="filters">{['All', ...kinds, 'Website'].map(kind => <button key={kind} className={filter === kind ? 'selected' : ''} onClick={() => setFilter(kind)}>{kind}</button>)}</div><span className="count">{sources.length} sources</span></div>
    <SourceList course={course} sources={filter === 'All' ? sources : sources.filter(s => s.kind === filter)} {...actions}/>
    <p className="source-footnote">Added links await ingestion. Format checks do not validate a page’s contents. PDFs you add are stored only in this browser.</p>
  </section><aside className="side-card"><div className="eyebrow">GIVE RECALL CONTEXT</div><h3>Bring your course in.</h3><p>A website, a slide deck, a paper. Start with whatever you have.</p>
    <DropZone quick onFile={file => onAdd('all', file)}/><button className="secondary" onClick={onLink}>↗ Add a website or link</button><div className="binding">Sources → lectures → understanding<span>You choose the lecture. AI matching and scraping are future integrations.</span></div>
  </aside></div>;
}

function LecturePage({ course, lecture, sources, onAdd, onRecord, ...actions }) {
  return <>
    <a className="back" href={'#course/' + course.id}>← {course.name}</a>
    <div className="lecture-detail-top"><div><div className="eyebrow">{course.code} / LECTURE {number(lecture)} / {date(lecture.date).toUpperCase()}, 2026</div><h1>{lecture.title}<em>.</em></h1><p className="intro">{lecture.subtitle} · {course.teacher}</p></div>
      {lecture.replay ? <a className="primary" href="lecture.html">Open lecture timeline ↗</a> : <button className="secondary" onClick={() => onRecord(lecture.id)}>◉ Preview session</button>}
    </div>
    {lecture.replay ? <ReplayCard/> : <div className="lecture-empty"><span className="empty-symbol">↝</span><div><h3>A place for the next thread.</h3><p>This lecture is a placeholder. Its title, date, and available source links are here; no timeline or summary has been generated.</p></div></div>}
    <div className="provenance"><div><small>01 · ORIGIN</small><b>Course sources</b><p>Website / local PDFs</p></div><span>→</span><div><small>02 · ASSOCIATION</small><b>Lecture {lecture.id}</b><p>{sources.length} linked sources</p></div><span>→</span><div><small>03 · CONTEXT</small><b>{lecture.replay ? 'Grounded moments' : 'Lecture placeholder'}</b><p>{lecture.replay ? 'Slides + transcript' : 'Ready for future content'}</p></div></div>
    <div className="sources-layout"><section><div className="subhead"><span>LECTURE MATERIALS</span><small>Click a PDF to open it</small></div><SourceList sources={sources} course={course} {...actions}/><p className="source-footnote">Associations are seeded from your local library. No automatic website crawl has run.</p></section>
    <aside className="side-card"><div className="eyebrow">BUILD THE CONTEXT</div><h3>Every source has a place.</h3><p>Add a slide deck, paper, or link directly to this lecture. Course-wide sources appear in every lecture.</p><button className="secondary" onClick={() => onAdd(lecture.id)}>+ Add to this lecture</button><a className="secondary" href={'#sources/' + course.id}>Course sources ↗</a></aside></div>
  </>;
}

function Session({ course, session, contextCount, onEnd }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - session.started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [session]);
  const clock = [Math.floor(elapsed / 60), elapsed % 60].map(value => String(value).padStart(2, '0')).join(':');
  return <><a className="back" href={'#course/' + course.id}>← Course workspace</a><div className="record-shell"><div className="eyebrow"><i/> UI SIMULATION · NO AUDIO CAPTURE</div>
    <h1>{session.title}<em>.</em></h1><div className="record-orb"><b>{clock}</b></div><p>In a connected session, the ideas being discussed would begin to appear here.</p>
    <span className="badge">{contextCount} sources available as context</span><div><button className="primary" onClick={onEnd}>■ End demo session</button></div><p className="form-note">No recording or transcript is created by this prototype.</p>
  </div></>;
}

function LectureSelect({ course, value }) {
  return <select name="lecture" defaultValue={value || 'all'}>
    <option value="all">Entire course · shared context</option>
    {course.lectures.map(l => <option value={l.id} key={l.id}>Lecture {l.id} · {l.title}</option>)}
  </select>;
}

function SourceForm({ course, dialog, onSwitch, onSave }) {
  const isLink = dialog.type === 'link';
  const [file, setFile] = useState(dialog.file);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submission = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submission.current) return;
    const data = new FormData(event.currentTarget);
    const source = { id: crypto.randomUUID(), course: course.id, lecture: data.get('lecture'), kind: data.get('kind'), custom: true };
    if (isLink) {
      try {
        const url = new URL(data.get('url'));
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
        onSave({ ...source, title: data.get('title').trim() || url.hostname, url: url.href });
      } catch { setError('Enter an http or https URL without embedded credentials.'); }
      return;
    }
    if (!file || file.size > 25 * 1048576) {
      setError('Choose a PDF no larger than 25 MB.');
      return;
    }
    submission.current = true;
    setBusy(true);
    try {
      const signature = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (!signature.includes('%PDF-')) {
        setError('This file does not appear to be a valid PDF.');
        return;
      }
      await storePdf(source.id, file);
      onSave({ ...source, title: file.name, file: true });
    } catch {
      setError('Browser storage could not save this PDF. Try a smaller file or allow site storage.');
    } finally {
      submission.current = false;
      setBusy(false);
    }
  }
  return <>
    <div className="eyebrow">{course.name.toUpperCase()} · {isLink ? 'CONNECT A SOURCE' : 'ADD CONTEXT'}</div>
    <h2>{isLink ? 'Start with a link.' : 'A home for every source.'}</h2>
    <p>{isLink ? 'Save a course website or document URL. Scraping, PDF discovery, and content validation are not connected yet.' : 'Add a PDF and choose where it belongs. The file stays in this browser.'}</p>
    <form onSubmit={submit}>
      {isLink ? <><label className="form-field"><span>Website or document URL</span><input type="url" name="url" required placeholder="https://your-course.edu/schedule"/></label>
        <label className="form-field"><span>Source name (optional)</span><input name="title" maxLength={150} placeholder="Course schedule or reading"/></label></> :
        <><DropZone onFile={setFile}/>{file && <div className="file-chip">▤ {file.name} · {(file.size / 1048576).toFixed(1)} MB</div>}</>}
      <label className="form-field"><span>Attach to</span><LectureSelect course={course} value={dialog.lecture}/>
        {!isLink && <small>You confirm the lecture. No AI content matching has run.</small>}</label>
      <label className="form-field"><span>Material type</span><select name="kind">{[...(isLink ? ['Website'] : []), ...kinds].map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <div className="message" role="status">{error}</div>
      <div className="form-actions">{isLink ? <span className="form-note">URL format checked · Content not fetched</span> : <button type="button" className="secondary" disabled={busy} onClick={event => onSwitch(new FormData(event.currentTarget.form).get('lecture'))}>Add a link instead ↗</button>}
        <button className="primary" type="submit" disabled={busy}>{isLink ? 'Add source ↗' : 'Save PDF ↗'}</button></div>
    </form>
  </>;
}

function NewCourseForm({ onSave }) {
  return <><div className="eyebrow">A NEW THREAD</div><h2>Make room for a course.</h2><p>Start with its name. Bring in its sources whenever you’re ready.</p>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const name = data.get('name').trim();
      if (name) onSave({ id: crypto.randomUUID(), name, code: data.get('code').trim() || 'MY COURSE', teacher: 'Your course workspace', lectures: [] });
    }}>
      <label className="form-field"><span>Course name</span><input name="name" required maxLength={100} placeholder="e.g. Machine Learning"/></label>
      <label className="form-field"><span>Course code</span><input name="code" maxLength={40} placeholder="e.g. COMPSCI 589"/></label>
      <div className="form-actions"><span className="form-note">Saved in this browser</span><button className="primary" type="submit">Create course ↗</button></div>
    </form></>;
}

function RecordForm({ course, lectureId, onStart }) {
  const lecture = course.lectures.find(item => item.id === lectureId);
  return <><div className="eyebrow">{course.name.toUpperCase()} · SESSION PREVIEW</div><h2>Ready when you are.</h2><p>This is a recording interface preview. No microphone is accessed and no audio is captured.</p>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      onStart({ course: course.id, title: data.get('title').trim() || 'New lecture', lecture: data.get('lecture'), started: Date.now() });
    }}>
      <label className="form-field"><span>Session title</span><input name="title" required maxLength={150} defaultValue={lecture?.title || 'New lecture'}/></label>
      <label className="form-field"><span>Use materials from</span><LectureSelect course={course} value={lectureId}/></label>
      <div className="form-actions"><span className="form-note">Microphone &amp; transcription not connected</span><button className="primary" type="submit">Begin demo session ↗</button></div>
    </form></>;
}

function PdfPreview({ dialog }) {
  const { url, title, local } = dialog;
  useEffect(() => () => { if (local) URL.revokeObjectURL(url); }, [url, local]);
  return <><div className="pdf-header"><h2>{title}</h2><a href={url} target="_blank" rel="noopener">Open in a new tab ↗</a></div>
    <iframe className="pdf-frame" title={title} src={url}/><p className="pdf-help">If the embedded preview is unavailable, open the PDF in a new tab.</p></>;
}

function Library() {
  const [hash, setHash] = useState(location.hash);
  const [userCourses, setUserCourses] = useState(() => readStored('recall-courses'));
  const [userSources, setUserSources] = useState(() => readStored('recall-sources'));
  const [session, setSession] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const toastTimer = useRef(null);
  const courses = [...baseCourses, ...userCourses];
  const [view = 'courses', id, lectureId] = (hash.slice(1) || 'courses').split('/');
  const course = courses.find(item => item.id === id);
  const lecture = course?.lectures.find(item => item.id === lectureId);
  const getSources = (courseId, lectureId) => [...baseSources, ...userSources].filter(source =>
    source.course === courseId && (!lectureId || source.lecture === lectureId || source.lecture === 'all'));
  const isLibrary = view === 'courses' || !course;
  useEffect(() => {
    const onHash = () => { setHash(location.hash); setDialog(null); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(toastTimer.current); };
  }, []);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [hash]);
  useEffect(() => {
    if (view === 'courses') return;
    if (!course || !['course', 'sources', 'lecture', 'record'].includes(view)) location.hash = 'courses';
    else if ((view === 'lecture' && !lecture) || (view === 'record' && session?.course !== course.id)) location.hash = 'course/' + course.id;
  }, [course, lecture, session, view]);

  function notify(text) {
    clearTimeout(toastTimer.current);
    setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(''), 3200);
  }
  function persist(key, value, success) {
    try { localStorage.setItem(key, JSON.stringify(value)); if (success) notify(success); }
    catch { notify('Storage is unavailable. Changes will last for this session.'); }
  }
  function onAdd(lecture = 'all', file) { setDialog({ type: 'pdf', lecture, file }); }
  function onLink(lecture = 'all') { setDialog({ type: 'link', lecture }); }
  function onRecord(lecture) { setDialog({ type: 'record', lecture }); }
  async function onPdf(source) {
    try {
      const file = source.file && await readPdf(source.id);
      if (source.file && !file) { notify('PDF unavailable in browser storage. Please add it again.'); return; }
      setDialog({ type: 'preview', title: source.title, local: Boolean(file), url: file ? URL.createObjectURL(file) : source.pdf });
    } catch { notify('Unable to access the stored PDF. Please add it again.'); }
  }
  function onRemove(id) {
    const next = userSources.filter(source => source.id !== id);
    setUserSources(next);
    persist('recall-sources', next, 'Source removed from the workspace.');
  }
  function onSaveSource(source) {
    const next = [...userSources, source];
    setUserSources(next);
    setDialog(null);
    persist('recall-sources', next, source.file ? 'PDF saved and linked to your selected context.' : 'Link saved. Automatic ingestion is not connected yet.');
  }

  return <>
    <div className="ambient" aria-hidden="true"/>
    <header><Brand href="#courses"/><div id="breadcrumb">{isLibrary ? <span>My courses</span> :
      view === 'course' ? <><a href="#courses">My courses</a><span>/ {course.name}</span></> :
        <><a href={'#course/' + course.id}>{course.name}</a><span>/ {view === 'lecture' ? 'Lecture ' + lectureId : view === 'sources' ? 'Sources' : 'Session'}</span></>}</div>
      <div className="header-end"><span>FALL 2026</span><button className="avatar" aria-label="About this workspace" onClick={() => setDialog({ type: 'about' })}>M</button></div>
    </header>
    <main id="page" key={hash}>
      {isLibrary ? <Courses courses={courses} getSources={getSources} onNew={() => setDialog({ type: 'course' })}/> : <>
        {['course', 'sources'].includes(view) && <CourseHeading course={course} sourceCount={getSources(id).length} active={view} onAdd={onAdd} onRecord={onRecord}/>}
        {view === 'course' && <CourseOverview course={course} getSources={getSources}/>}
        {view === 'sources' && <CourseSources course={course} sources={getSources(id)} onAdd={onAdd} onLink={() => onLink()} onPdf={onPdf} onRemove={onRemove}/>}
        {view === 'lecture' && lecture && <LecturePage course={course} lecture={lecture} sources={getSources(id, lectureId)} onAdd={onAdd} onRecord={onRecord} onPdf={onPdf} onRemove={onRemove}/>}
        {view === 'record' && session?.course === id && <Session course={course} session={session} contextCount={getSources(id, session.lecture === 'all' ? undefined : session.lecture).length}
          onEnd={() => { setSession(null); location.hash = 'course/' + id; notify('Demo ended. No audio was recorded.'); }}/>}
        {view !== 'record' && <div className="bottom-note"><span>A little rewind. A lot of clarity.</span><span>Interactive prototype · No background AI connected</span></div>}
      </>}
    </main>
    <Dialog wide={dialog?.type === 'preview'} onClose={() => setDialog(null)}>
      {dialog?.type === 'about' && <><div className="eyebrow">RECALL · WORKSPACE PREVIEW</div><h2>Your learning, connected.</h2><p>Courses hold lectures. Sources belong to the whole course or to one lecture. AI Alignment Lecture 02 opens the immersive timeline; other lectures are placeholders.</p><p>Uploaded PDFs and added course metadata stay in this browser. The six bundled PDFs are copied from your original library. Website scraping, AI matching, content validation, recording, and transcription are not connected.</p></>}
      {dialog?.type === 'course' && <NewCourseForm onSave={item => {
        const next = [...userCourses, item]; setUserCourses(next); persist('recall-courses', next); setDialog(null); location.hash = 'course/' + item.id;
      }}/>}
      {(dialog?.type === 'pdf' || dialog?.type === 'link') && <SourceForm key={dialog.type} course={course} dialog={dialog} onSwitch={onLink} onSave={onSaveSource}/>}
      {dialog?.type === 'preview' && <PdfPreview dialog={dialog}/>}
      {dialog?.type === 'record' && <RecordForm course={course} lectureId={dialog.lecture} onStart={item => {
        setSession(item); setDialog(null); location.hash = 'record/' + id;
      }}/>}
    </Dialog>
    <div id="notice" role="status" className={message ? 'show' : ''}>{message}</div>
  </>;
}

createRoot(document.getElementById('root')).render(<Library/>);
