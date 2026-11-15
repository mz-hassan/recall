import React, { useEffect, useRef, useState } from 'react';
import { authenticateDemo, matchCourse, readDoubts, topicDoubts, loadDoubts } from './accounts.js';
import { loadPastTopics } from '../lecture/pastTopics.js';
import { Dialog } from '../ui.jsx';
import { MomentDetail } from '../lecture/MomentDetail.jsx';
import './classroom.css';

const roleNames = { student: 'Student', instructor: 'Instructor', ta: 'Teaching assistant' };

export function AccountForm({ role, signup, onSignIn }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mode = signup ? 'signup' : 'signin';
  return <section className="classroom-signin">
    <div className="eyebrow">RECALL · DEMO ACCESS</div>
    <h1>{roleNames[role]} {signup ? 'signup' : 'login'}<em>.</em></h1>
    <nav aria-label="Choose an account role" className="classroom-roles">
      {Object.entries(roleNames).map(([key, label]) => <a key={key} className="secondary" aria-current={role === key ? 'page' : undefined} href={'#' + mode + '/' + key}>{label}</a>)}
    </nav>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const form = new FormData(event.currentTarget);
      const email = form.get('email').trim().toLowerCase();
      if (!/^[^\s@]+@(?:[a-z0-9-]+\.)+edu$/.test(email)) {
        setError('Enter an academic email ending in .edu.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const profile = await authenticateDemo({ email, role, password: form.get('password'), invite: form.get('invite') || undefined, signup });
        if (!onSignIn(profile)) setError('This browser could not save your login.');
      } catch (failure) { setError(failure.message); }
      finally { setBusy(false); }
    }}>
      <label className="form-field"><span>Academic email</span><input type="email" name="email" autoComplete="username" placeholder="you@umass.edu" required/></label>
      <label className="form-field"><span>Password</span><input type="password" name="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} maxLength={128} required/></label>
      {signup && role !== 'student' && <label className="form-field"><span>Staff invitation code (if required)</span><input name="invite" type="password" maxLength={256}/></label>}
      {signup && <p className="form-note">Use at least 8 characters and a password just for this demo.</p>}
      {error && <p className="message" role="alert">{error}</p>}
      <div className="account-actions">
        <button className="primary" type="submit" disabled={busy}>{signup ? 'Create account' : 'Log in'} ↗</button>
        <a className="source-link" href={'#' + (signup ? 'signin' : 'signup') + '/' + role}>{signup ? 'Already have an account? Log in' : 'Create an account'}</a>
      </div>
    </form>
    <p className="form-note classroom-access-note">Sign in to keep lecture history, questions, and doubts with your account. Email ownership and staff roles aren’t verified.</p>
  </section>;
}

export function CourseSearch({ courses, enrolled, onJoin, onCreate, coursePath }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const results = courses.filter(course =>
    !term || course.name.toLowerCase().includes(term) || course.code.toLowerCase().includes(term) || matchCourse([course], term));
  return <section className="course-search">
    <a className="back" href="#courses">← My courses</a>
    <div className="hero"><h1>Find a course<em>.</em></h1><button className="secondary" onClick={onCreate}>+ Create course</button></div>
    <label className="form-field"><span>Search by course name or code</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. AI Alignment or 690S"/></label>
    {results.length ? <ul className="course-search-results">{results.map(course => <li key={course.id}>
      <div><strong>{course.name}</strong><small>{course.code}</small></div>
      {enrolled.includes(course.id) ? <a className="secondary" href={coursePath(course)}>Open course ↗</a>
        : <button className="secondary" onClick={() => onJoin(course)}>Add course +</button>}
    </li>)}</ul> : <p className="empty-state">No matching courses.</p>}
  </section>;
}

export function StaffOverview({ course, profile }) {
  const lectures = course.lectures.filter(lecture => lecture.replay || lecture.notesAvailable)
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
  const [entries, setEntries] = useState(readDoubts);
  const [reports, setReports] = useState(null);
  const [topic, setTopic] = useState(null);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);

  useEffect(() => {
    let active = true;
    Promise.all(lectures.map(async lecture => {
      try { return { lecture, topics: await loadPastTopics(lecture,{prepared:Boolean(profile.id)&&lecture.notesAvailable}) }; }
      catch { return { lecture, topics: [] }; }
    })).then(result => { if (active) setReports(result); });
    return () => { active = false; };
  }, [course]);
  useEffect(()=>{let active=true;loadDoubts(profile,course.id).then(entries=>{if(active)setEntries(entries);}).catch(()=>{});return()=>{active=false;};},[profile,course.id]);

  useEffect(() => {
    const refresh = () => setEntries(readDoubts());
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  return <div className="staff-overview">
    <a className="back" href={'#course/' + course.id}>← Course overview</a>
    <div className="eyebrow">{course.code} · {roleNames[profile.role]}</div>
    <h1>Lecture doubts<em>.</em></h1>
    <p className="intro">Expand a lecture to see which topics students marked unclear.</p>
    {!lectures.length && <p className="empty-state">No past timelines are available for this course yet.</p>}
    {lectures.length > 0 && !reports && <p role="status">Loading past lectures…</p>}
    <div className="staff-lecture-list">
      {!!reports?.length && <div className="staff-doubt-heading">Doubts</div>}
      {reports?.map(({ lecture, topics }) => {
        const rows = topics.map(moment => ({ moment, count: topicDoubts(course.id, moment.id, entries,Boolean(profile.id)).total }));
        const total = rows.reduce((sum, row) => sum + row.count, 0);
        return <details className="source-group staff-lecture" key={lecture.id}>
          <summary>
            <span className="staff-lecture-title">
              <small>Lecture {lecture.id.padStart(2, '0')} · <time dateTime={lecture.date}>{lecture.date}</time></small>
              {lecture.title}
            </span>
            <span className="staff-doubt-count">{rows.length ? total : 'Unavailable'}</span>
          </summary>
          {rows.length ? <ul className="staff-topic-list">
            {rows.map(({ moment, count }) => <li key={moment.id}>
              <button type="button" className="source-link" onClick={() => setTopic(moment)}>{moment.short}</button>
              <span className="staff-doubt-count">{count}</span>
            </li>)}
          </ul> : <p className="intro">Topic data unavailable.</p>}
        </details>;
      })}
    </div>
    <p className="form-note classroom-access-note">{profile.id?'Counts reflect saved doubt markers from students in this course.':'Counts include simulated data and student marks from this browser.'} Lecture totals add up the marks across topics.</p>
    <Dialog onClose={() => { setTopic(null); setPreview(null); }}>
      {topic && <div className="staff-topic-detail">
        <MomentDetail moment={topic} onOpen={setPreview}/>
        {preview && <details ref={previewRef} tabIndex={-1} className="staff-topic-preview" open key={preview.slide?.page ?? 'transcript'}>
          <summary>{preview.slide ? 'Original slide ' + preview.slide.page : 'Transcript excerpt'}</summary>
          {preview.slide ? <img src={preview.slide.url} alt={'Original slide ' + preview.slide.page}/> : <blockquote>{topic.quote}</blockquote>}
        </details>}
      </div>}
    </Dialog>
  </div>;
}

