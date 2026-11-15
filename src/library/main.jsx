import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Dialog } from '../ui.jsx';
import { readStored, readPdf, storePdf } from '../storage.js';
import { baseCourses, baseSources } from './content.js';
import { mergeNotesCatalog,noteSources } from './notesCatalog.js';
import './library.css';
import { ReadingPage } from '../readings/ReadingPage.jsx';
import { PapersPage } from '../readings/PapersPage.jsx';
import { papersForCourse, paperPath } from '../readings/catalog.js';
// The paper reader pulls in the PDF and diagram libraries, so load it only when a paper is opened.
const PaperReader = lazy(() => import('../readings/PaperReader.jsx').then(module => ({ default: module.PaperReader })));
import { CourseGraphPage } from '../graph/CourseGraphPage.jsx';
import { CourseGraphButton } from '../graph/CourseGraphButton.jsx';
import { replayPath } from '../lecture/replay.js';
import { enrolledCourseIds, isCourseStaff, joinCourse, readProfile, saveProfile, restoreAccount, logoutAccount } from '../classroom/accounts.js';
import { AccountForm, CourseSearch, StaffOverview } from '../classroom/Classroom.jsx';
import { QuizDialog } from '../quizzes/QuizDialog.jsx';
import { Leaderboard } from '../quizzes/Leaderboard.jsx';

const date = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const number = lecture => lecture.id.padStart(2, '0');
const lecturePath = (course, lecture) => '#lecture/' + course.id + '/' + lecture.id;
const kinds = ['Slides', 'Required', 'Optional'];
const readingKinds = ['Required', 'Optional'];
// Known course papers open in the full paper reader; other sources keep the lecture-level breakdown page.
const breakdownPath = (course, lecture, source) => {
  const paper = papersForCourse(course.id).find(item => item.originalUrl && item.originalUrl === source.url);
  return paper ? paperPath(paper) : '#reading/' + course.id + '/' + lecture.id + '/' + encodeURIComponent(source.id);
};

function Art({ vision }) {
  return <div className="orb" aria-hidden="true"><svg viewBox="0 0 260 260">
    {vision ? <><path d="M42 42h176v176H42zM64 64h132v132H64zM87 87h86v86H87z" fill="none" strokeWidth=".8"/><circle cx="130" cy="130" r="24"/></> :
      <><ellipse cx="130" cy="130" rx="94" ry="44" transform="rotate(35 130 130)"/><ellipse cx="130" cy="130" rx="94" ry="44" transform="rotate(-35 130 130)"/><circle cx="130" cy="130" r="67"/><circle cx="130" cy="130" r="6" className="star"/></>}
  </svg></div>;
}

function Courses({ courses, getSources, coursePath, staff }) {
  return <>
    <div className="hero">
      <div>
        <div className="eyebrow">{staff ? 'TEACHING WORKSPACE' : 'STUDENT WORKSPACE'}</div>
        <h1>My courses<em>.</em></h1>
      </div>
      <a className="secondary" href="#find-courses">+ Find or add a course</a>
    </div>
    {courses.length ? <div className="course-grid">{courses.map(course => <a key={course.id} href={coursePath(course)} className={'course-card' + (course.id === 'cv' ? ' vision' : '')}>
      <Art vision={course.id === 'cv'}/><div className="code">{course.code}</div><h2>{course.name}</h2><p>{course.description || 'A workspace for your lectures and materials.'}</p>
      <div className="card-bottom"><span>{course.lectures.length} lectures</span><span>{getSources(course.id).length} sources</span><b>↗</b></div>
    </a>)}</div> : <p className="empty-state">Find a course by name or code, or create one to get started.</p>}
  </>;
}

function CourseHeading({ course, sourceCount, active, onAdd, nextLecture, onStartSession, staff }) {
  return <>
    <a className="back" href="#courses">← My courses</a>
    <div className="hero course-hero"><div><div className="eyebrow">{course.code} &nbsp; / &nbsp; {course.term || 'FALL 2026'}</div><h1>{course.name}<em>.</em></h1><p className="intro">{course.teacher || 'Your course workspace'} · {course.lectures.length} lectures in your library</p></div>
    <div className="hero-actions">{active === 'course' && <CourseGraphButton courseId={course.id}/>}<button className="secondary" onClick={() => onAdd()}>+ Add sources</button><div className="session-launch">
      <button className="primary" onClick={onStartSession} disabled={!nextLecture}>◉ Start a session</button>
      {!nextLecture && <small>{course.lectures.length ? 'No upcoming lectures.' : 'No lectures scheduled.'}</small>}
    </div></div></div>
    <nav className="tabs">{staff && <a href={'#staff/' + course.id}>Lecture doubts ↗</a>}<a className={active === 'course' ? 'active' : ''} href={'#course/' + course.id}>Overview &amp; lectures <small>{course.lectures.length}</small></a><a className={active === 'papers' ? 'active' : ''} href={'#papers/' + course.id}>Papers</a><a className={active === 'sources' ? 'active' : ''} href={'#sources/' + course.id}>Sources <small>{sourceCount}</small></a><a className={active === 'leaderboard' ? 'active' : ''} href={'#leaderboard/' + course.id}>Quiz leaderboard</a></nav>
  </>;
}

// Prepared notes use the normal timeline. Explicit simulations remain on Course material.
const hasCuratedReplay = lecture => lecture.courseId === 'ai' && lecture.id === '2';
const studyNotesPath = lecture => replayPath(lecture.id, false, lecture.courseId) + '&view=notes';
function lectureTimelinePath(lecture) {
  if (hasCuratedReplay(lecture)) return replayPath(lecture.id);
  if (lecture.notesAvailable) return studyNotesPath(lecture);
  return replayPath(lecture.id, true, lecture.courseId, lecture.microphone);
}

function CourseOverview({ course, getSources, onQuiz }) {
  return <>
    <div className="subhead"><span>LECTURES</span><small>{course.lectures.length} in the course library</small></div>
    {course.lectures.length ? <div className="lecture-list">{course.lectures.map(lecture => <article key={lecture.id} className="lecture-row course-lecture-row">
      <span className="lecture-number">{number(lecture)}</span>
      <div>
        <h3>{lecture.replay||lecture.notesAvailable ? <a className="lecture-timeline-link" href={lectureTimelinePath(lecture)}>{lecture.title}</a> : lecture.title}</h3>
        <p>{lecture.date ? date(lecture.date) + ', 2026' : course.term || 'Recording date unavailable'}{lecture.notesAvailable?(lecture.notesBasis==='materials'?' · Preparation notes from materials':' · Study notes ready'):!lecture.replay&&' · No timeline available'}</p>
      </div>
      <div className="course-lecture-actions">
        {(lecture.replay||lecture.notesAvailable)&&<button type="button" className="source-link" onClick={()=>onQuiz(lecture)}>Take lecture quiz ↗</button>}
        <a className="source-link" href={lecturePath(course, lecture)} aria-label={'Course material for Lecture ' + number(lecture)}>Course material ↗</a>
      </div>
    </article>)}</div> : <div className="empty-state">Your first thread starts here. Add course sources, then preview a session.</div>}
    <div className="source-preview"><div><b>One course. A shared foundation.</b><p>Course links and PDFs stay connected to the lectures they belong to.</p></div><a href={'#sources/' + course.id}>Explore {getSources(course.id).length} sources ↗</a></div>
  </>;
}

function DropZone({ quick = false, onFile }) {
  const [dragging, setDragging] = useState(false);
  return <label className={'drop-zone' + (dragging ? ' dragover' : '')} onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)} onDrop={event => {
      event.preventDefault(); setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file) onFile(file);
    }}>
    <span className="upload-symbol" aria-hidden="true">↥</span><strong>{quick ? 'Drop a PDF here' : 'Drop your PDF here'}</strong><span className="upload-help">{quick ? 'or choose a file · up to 25 MB' : 'or choose a file · PDF only · 25 MB maximum'}</span>
    <input type="file" accept="application/pdf,.pdf" aria-label={quick ? 'Choose course PDF' : 'Choose PDF'} onChange={event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (file) onFile(file);
    }}/>
  </label>;
}

function SourceLink({ source, onPdf, children = source.title }) {
  return source.pdf || source.file
    ? <button type="button" className="source-link" onClick={() => onPdf(source)}>{children} <span aria-hidden="true">↗</span></button>
    : <a className="source-link" href={source.url} target="_blank" rel="noopener noreferrer">{children} <span aria-hidden="true">↗</span></a>;
}

function SourceLinks({ sources, showKind = true, readingPath, onPdf, onRemove }) {
  return <ul className={'source-links' + (showKind ? '' : ' source-links-by-kind')}>{sources.map(source => <li key={source.id}>
    {showKind && <span className="source-link-kind">{source.kind}</span>}
    <SourceLink source={source} onPdf={onPdf}/>
    <div className="source-link-actions">
      {readingPath && readingKinds.includes(source.kind) && <a className="source-link" href={readingPath(source)} aria-label={'Breakdown for ' + source.title}>Breakdown ↗</a>}
      {source.custom && onRemove && <button type="button" className="source-link-remove" aria-label={'Remove ' + source.title} onClick={() => onRemove(source.id)}>×</button>}
    </div>
  </li>)}</ul>;
}

function CourseSources({ course, sources, onAdd, onLink, ...actions }) {
  const [filter, setFilter] = useState('All');
  const visible = filter === 'All' ? sources : sources.filter(source => source.kind === filter);
  const byLecture = new Map();
  for (const source of visible) {
    if (!byLecture.has(source.lecture)) byLecture.set(source.lecture, []);
    byLecture.get(source.lecture).push(source);
  }
  const courseWide = byLecture.get('all');
  const lectureTitles = new Map(course.lectures.map(lecture => [lecture.id, lecture.title]));
  const lectureGroups = [...byLecture].filter(([id]) => id !== 'all')
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

  return <div className="sources-layout"><section>
    <div className="source-toolbar"><div className="filters">{['All', ...kinds, 'Website'].map(kind => <button key={kind} className={filter === kind ? 'selected' : ''} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}</div><span className="count">{visible.length} {visible.length === 1 ? 'source' : 'sources'}</span></div>
    {courseWide && <section className="source-group">
      <h2>Course-wide resources</h2>
      <SourceLinks sources={courseWide} {...actions}/>
    </section>}
    {lectureGroups.map(([id, entries]) => <details className="source-group" key={id}>
      <summary><span className="source-group-title">Lecture {number({ id })}{lectureTitles.has(id) && <span className="source-group-topic"> · {lectureTitles.get(id)}</span>}</span><span className="source-group-count">{entries.length} {entries.length === 1 ? 'source' : 'sources'}</span></summary>
      <SourceLinks sources={entries} {...actions}/>
    </details>)}
    {!visible.length && <p className="empty-state">{sources.length ? 'No sources match this filter.' : 'No sources yet. Add a PDF or course link.'}</p>}
    <p className="source-footnote">Added links await ingestion. Format checks do not validate a page’s contents. PDFs you add are stored only in this browser.</p>
  </section><aside className="side-card"><div className="eyebrow">GIVE RECALL CONTEXT</div><h3>Bring your course in.</h3><p>A website, a slide deck, a paper. Start with whatever you have.</p>
    <DropZone quick onFile={file => onAdd('all', file)}/><button className="secondary" onClick={onLink}>↗ Add a website or link</button><div className="binding">Sources → lectures → understanding<span>You choose the lecture. AI matching and scraping are future integrations.</span></div>
  </aside></div>;
}

function LectureMaterials({ course, lecture, sources, onAdd, onQuiz, ...actions }) {
  const groups = [
    ['Required', 'Required readings'],
    ['Optional', 'Optional readings'],
    ['Slides', 'Slides'],
    ['Website', 'Web links'],
  ];
  return <>
    <a className="back" href={'#course/' + course.id}>← {course.name}</a>
    <div className="lecture-detail-top">
      <div>
        <div className="eyebrow">{course.code} · LECTURE {number(lecture)}</div>
        <h1>Course material<em>.</em></h1>
        <p className="intro">{lecture.title}</p>
      </div>
      <div className="hero-actions">
        <button className="secondary" onClick={() => onAdd(lecture.id)}>+ Add to this lecture</button>
        {(lecture.replay||lecture.notesAvailable)&&<button type="button" className="secondary" onClick={()=>onQuiz(lecture)}>Take lecture quiz ↗</button>}
        {hasCuratedReplay(lecture) && <a className="primary" href={lectureTimelinePath(lecture)}>Curated timeline ↗</a>}
        {lecture.notesAvailable && <a className={hasCuratedReplay(lecture) ? 'secondary' : 'primary'} href={studyNotesPath(lecture)}>Study notes ↗</a>}
        {lecture.microphone && <a className="primary" href={replayPath(lecture.id, false, course.id, true)}>Start live lecture ↗</a>}
        {lecture.replay && <a className="secondary" href={replayPath(lecture.id, true, course.id) + (lecture.microphone ? '&restart=1' : '')}>{lecture.microphone ? 'Replay reference transcript' : 'Simulate live'} ↗</a>}
      </div>
    </div>
    <div className="lecture-materials">
      {lecture.microphone && <p className="intro">Start live lecture to use your microphone in the lecture timeline. Starting a new capture or reference replay replaces this lecture’s current timeline.</p>}
      {groups.map(([kind, label]) => {
        const entries = sources.filter(source => source.kind === kind);
        return entries.length > 0 && <section className="source-group" key={kind}>
          <h2>{label}</h2>
          <SourceLinks sources={entries} showKind={false} readingPath={source => breakdownPath(course, lecture, source)} {...actions}/>
        </section>;
      })}
      {!sources.length && <p className="empty-state">No materials have been added to this lecture.</p>}
    </div>
  </>;
}

function Session({ course, session, onPdf, onEnd }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - session.started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [session]);
  const clock = [Math.floor(elapsed / 60), elapsed % 60].map(value => String(value).padStart(2, '0')).join(':');
  return <>
    <a className="back" href={'#course/' + course.id}>← Course workspace</a>
    <div className="record-shell">
      <div className="eyebrow"><i/> SIMULATED LIVE SESSION · LECTURE {number(session.lecture)}</div>
      <h1>{session.lecture.title}<em>.</em></h1>
      <div className="record-orb"><b>{clock}</b></div>
      <p role="status">Session started · Waiting for transcript</p>
      <button className="primary" onClick={onEnd}>■ End demo session</button>
    </div>
    <section className="session-context">
      <div className="subhead"><h2>Session context</h2><small>{session.sources.length} {session.sources.length === 1 ? 'source' : 'sources'}</small></div>
      {session.sources.length ? <SourceLinks sources={session.sources} onPdf={onPdf}/> : <p className="intro">No sources are attached to this lecture or course yet.</p>}
    </section>
  </>;
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
    <form className="source-form" onSubmit={submit}>
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

function PdfPreview({ dialog }) {
  const { url, title, local } = dialog;
  useEffect(() => () => { if (local) URL.revokeObjectURL(url); }, [url, local]);
  return <><div className="pdf-header"><h2>{title}</h2><a href={url} target="_blank" rel="noopener">Open in a new tab ↗</a></div>
    <iframe className="pdf-frame" title={title} src={url}/><p className="pdf-help">If the embedded preview is unavailable, open the PDF in a new tab.</p></>;
}

function Library() {
  const [hash, setHash] = useState(location.hash);
  const [profile, setProfile] = useState(readProfile);
  const [enrolled, setEnrolled] = useState(() => enrolledCourseIds(profile));
  const [noteCatalog,setNoteCatalog]=useState([]);
  const [accountReady,setAccountReady]=useState(false);
  const [catalogReady,setCatalogReady]=useState(false);
  useEffect(()=>{let active=true;fetch('/api/courses/notes').then(response=>response.ok?response.json():{lectures:[]}).then(data=>{if(active)setNoteCatalog(data.lectures??[]);}).catch(()=>{}).finally(()=>{if(active)setCatalogReady(true);});return()=>{active=false;};},[]);
  useEffect(()=>{let active=true;restoreAccount().then(user=>{if(active){setProfile(user);setEnrolled(enrolledCourseIds(user));}}).catch(error=>{if(active)setMessage(error.message);}).finally(()=>{if(active)setAccountReady(true);});return()=>{active=false;};},[]);
  const [userCourses, setUserCourses] = useState(() => readStored('recall-courses'));
  const [userSources, setUserSources] = useState(() => readStored('recall-sources'));
  const [session, setSession] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [message, setMessage] = useState('');
  const toastTimer = useRef(null);
  const courses = mergeNotesCatalog([...baseCourses, ...userCourses],noteCatalog);
  const [view = 'courses', id, lectureId, sourceKey] = (hash.slice(1) || 'courses').split('/');
  const course = courses.find(item => item.id === id);
  const staff = isCourseStaff(profile, id) && enrolled.includes(id);
  const teaching = profile && profile.role !== 'student';
  const coursePath = item => (teaching ? '#staff/' : '#course/') + item.id;
  const accountPage = ['signin', 'signup'].includes(view);
  const signInRole = ['instructor', 'ta'].includes(id) ? id : 'student';
  const lecture = course?.lectures.find(item => item.id === lectureId);
  const lastCompletedIndex = course?.lectures.findLastIndex(item => item.replay) ?? -1;
  const nextLecture = course?.lectures.find(item => item.microphone) ?? course?.lectures[lastCompletedIndex + 1];
  const getSources = (courseId, lectureId) => [...baseSources, ...userSources,...noteSources(noteCatalog,baseSources)].filter(source =>
    source.course === courseId && (!lectureId || source.lecture === lectureId || source.lecture === 'all'));
  const materials = lecture ? getSources(id, lecture.id).filter(source => source.lecture === lecture.id) : [];
  const reading = view === 'reading' && materials.find(source =>
    encodeURIComponent(source.id) === sourceKey && readingKinds.includes(source.kind));
  const canOpenCourse = profile && course && enrolled.includes(id);
  const openQuiz = item => setQuiz({courseId:course.id,lectureId:item.id,scope:'lecture',source:hasCuratedReplay(item)?'curated':item.notesAvailable?'notes':'transcript'});
  useEffect(() => {
    const onHash = () => { setHash(location.hash); setDialog(null); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(toastTimer.current); };
  }, []);
  const pageKey = view === 'paper' ? ['paper', id, lectureId].join('/') : hash;
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [pageKey]);
  useEffect(() => {
    if (!accountReady || !catalogReady) return;
    if (!profile) {
      if (!accountPage) location.hash = view === 'staff' ? 'signin/instructor' : 'signin/student';
      return;
    }
    if (accountPage) { location.hash = 'courses'; return; }
    if (['courses', 'find-courses'].includes(view)) return;
    if (!canOpenCourse) { location.hash = 'find-courses'; return; }
    if (view === 'staff' && !staff) { location.hash = 'course/' + id; return; }
    if (!['course', 'sources', 'papers', 'paper', 'lecture', 'reading', 'record', 'staff', 'graph', 'leaderboard'].includes(view)) location.hash = 'courses';
    else if ((['lecture', 'reading'].includes(view) && !lecture) || (view === 'record' && session?.course !== course.id)) location.hash = 'course/' + course.id;
    else if (view === 'reading' && !sourceKey) location.hash = lecturePath(course, lecture);
  }, [accountReady, catalogReady, accountPage, canOpenCourse, course, id, lecture, profile, session, sourceKey, staff, view]);

  function notify(text) {
    clearTimeout(toastTimer.current);
    setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(''), 3200);
  }
  function persist(key, value, success) {
    try { localStorage.setItem(key, JSON.stringify(value)); if (success) notify(success); }
    catch { notify('Storage is unavailable. Changes will last for this session.'); }
  }
  function onSignIn(nextProfile) {
    try { saveProfile(nextProfile); }
    catch { return false; }
    setProfile(nextProfile);
    setEnrolled(enrolledCourseIds(nextProfile));
    location.hash = 'courses';
    return true;
  }
  async function onSignOut() {
    try { await logoutAccount(profile); }
    catch(error) { notify(error.message||'Could not sign out.'); return; }
    setProfile(null);
    setEnrolled([]);
    setSession(null);
    location.hash = 'signin/' + profile.role;
  }
  async function onJoin(item) {
    if (!profile) return;
    let updated;
    try { updated=await joinCourse(profile, item.id); }
    catch(error) { notify(error.message||'Could not add the course.'); return; }
    setProfile(updated);setEnrolled(enrolledCourseIds(updated));
    setDialog(null);
    location.hash = coursePath(item);
  }
  function onAdd(lecture = 'all', file) { setDialog({ type: 'pdf', lecture, file }); }
  function onLink(lecture = 'all') { setDialog({ type: 'link', lecture }); }
  function onStartSession() {
    if (!nextLecture) return;
    if (nextLecture.microphone) { location.href = replayPath(nextLecture.id, false, course.id, true); return; }
    setSession({
      course: course.id,
      lecture: nextLecture,
      sources: getSources(course.id, nextLecture.id),
      started: Date.now(),
    });
    location.hash = 'record/' + course.id;
  }
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
    <header><Brand href={profile ? '#courses' : '#signin/' + signInRole}/><div id="breadcrumb">{!canOpenCourse ? <span>{view === 'find-courses' ? 'Find a course' : profile ? 'My courses' : 'Account access'}</span> :
      view === 'course' ? <><a href="#courses">My courses</a><span>/ {course.name}</span></> :
        <><a href={'#course/' + course.id}>{course.name}</a><span>/ {['papers', 'paper'].includes(view) ? 'Papers' : ['lecture', 'reading'].includes(view) ? 'Lecture ' + lectureId : view === 'sources' ? 'Sources' : view === 'staff' ? 'Lecture doubts' : view === 'graph' ? 'Knowledge graph' : view === 'leaderboard' ? 'Quiz leaderboard' : 'Session'}</span></>}</div>
      <div className="header-end">
        {profile ? <button className="secondary" onClick={onSignOut}>Sign out</button>
          : <a className="secondary" href="#signin/student">Sign in</a>}
        <button className="avatar" aria-label="About this workspace" onClick={() => setDialog({ type: 'about' })}>M</button>
      </div>
    </header>
    <main id="page" key={pageKey}>
      {!accountReady||!catalogReady ? <p role="status">Opening your workspace…</p> : !profile ? <AccountForm role={signInRole} signup={view === 'signup'} onSignIn={onSignIn}/>
        : view === 'courses' ? <Courses courses={courses.filter(item => enrolled.includes(item.id))} getSources={getSources} coursePath={coursePath} staff={teaching}/>
        : view === 'find-courses' ? <CourseSearch courses={courses} enrolled={enrolled} onJoin={onJoin} coursePath={coursePath} onCreate={() => setDialog({ type: 'course' })}/>
        : canOpenCourse && <>
        {['course', 'sources', 'papers', 'leaderboard'].includes(view) && <CourseHeading course={course} sourceCount={getSources(id).length} active={view} onAdd={onAdd} staff={staff} nextLecture={nextLecture} onStartSession={onStartSession}/>}
        {view === 'leaderboard' && <Leaderboard courseId={course.id} course={course}/>}
        {view === 'staff' && staff && <StaffOverview course={course} profile={profile}/>}
        {view === 'graph' && <CourseGraphPage course={course}/>}
        {view === 'course' && <CourseOverview course={course} getSources={getSources} onQuiz={openQuiz}/>}
        {view === 'sources' && <CourseSources course={course} sources={getSources(id)} onAdd={onAdd} onLink={() => onLink()} onPdf={onPdf} onRemove={onRemove}/>}
        {view === 'papers' && <PapersPage course={course}/>}
        {view === 'paper' && <Suspense fallback={<div className="empty-state">Opening your paper…</div>}><PaperReader course={course} paperId={lectureId} anchorId={sourceKey}/></Suspense>}
        {view === 'reading' && lecture && sourceKey && <ReadingPage course={course} lecture={lecture} source={reading}
          materialPath={lecturePath(course, lecture)} original={reading && <SourceLink source={reading} onPdf={onPdf}>Open original</SourceLink>}/>}
        {view === 'lecture' && lecture && <LectureMaterials course={course} lecture={lecture} sources={materials} onAdd={onAdd} onQuiz={openQuiz} onPdf={onPdf} onRemove={onRemove}/>}
        {view === 'record' && session?.course === id && <Session course={course} session={session} onPdf={onPdf}
          onEnd={() => { setSession(null); location.hash = 'course/' + id; notify('Demo ended. No audio was recorded.'); }}/>}
        {!['record', 'staff', 'paper'].includes(view) && <div className="bottom-note"><span>A little rewind. A lot of clarity.</span><span>Your notes, materials, and lecture threads</span></div>}
      </>}
    </main>
    {quiz && <QuizDialog options={quiz} onClose={()=>setQuiz(null)}/>}
    <Dialog wide={dialog?.type === 'preview'} onClose={() => setDialog(null)}>
      {dialog?.type === 'about' && <><div className="eyebrow">RECALL · COURSE WORKSPACE</div><h2>Your learning, connected.</h2><p>Courses connect materials, prepared study notes, and live lecture threads. Sign in to save your lectures, questions, and doubt markers with your account. Prepared course notes are shared with enrolled users.</p><p>PDFs you upload and custom course metadata still stay in this browser. CS50 supports local microphone transcription in the lecture timeline.</p></>}
      {dialog?.type === 'course' && <NewCourseForm onSave={item => {
        const next = [...userCourses, item]; setUserCourses(next); persist('recall-courses', next); onJoin(item);
      }}/>}
      {(dialog?.type === 'pdf' || dialog?.type === 'link') && <SourceForm key={dialog.type} course={course} dialog={dialog} onSwitch={onLink} onSave={onSaveSource}/>}
      {dialog?.type === 'preview' && <PdfPreview dialog={dialog}/>}
    </Dialog>
    <div id="notice" role="status" className={message ? 'show' : ''}>{message}</div>
  </>;
}

createRoot(document.getElementById('root')).render(<Library/>);
