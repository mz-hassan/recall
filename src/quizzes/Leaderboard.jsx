import React, { useEffect, useState } from 'react';
import { leaderboard } from './api.js';
import './quizzes.css';

export function Leaderboard({ courseId, course, quizFilter }) {
  const [scope, setScope] = useState(''), [lectureId, setLectureId] = useState('');
  const [data, setData] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const fixedLecture = quizFilter?.lectureId, quizKey = quizFilter?.quizKey;
  useEffect(() => {
    const controller = new AbortController();setError('');setData(null);
    leaderboard(courseId, { scope, lectureId: fixedLecture || lectureId, quizKey }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [courseId, scope, lectureId, fixedLecture, quizKey, refresh]);
  return <section className="quiz-leaderboard" aria-label="Course quiz leaderboard">
    <div className="eyebrow">{course?.code || 'COURSE QUIZZES'}</div>
    <h2>{quizKey ? 'This quiz leaderboard' : 'Course leaderboard'}</h2>
    <p>First submitted attempts only. Topic quizzes earn up to 10 points; lecture quizzes up to 100. Retakes are practice. Equal points share a rank.</p>
    {!quizKey && <div className="quiz-filters">
      <label>Quiz type<select value={scope} onChange={event => setScope(event.target.value)}><option value="">All quizzes</option><option value="topic">Topic quizzes</option><option value="lecture">Lecture quizzes</option></select></label>
      {!!course?.lectures?.length && <label>Lecture<select value={lectureId} onChange={event => setLectureId(event.target.value)}><option value="">All lectures</option>{course.lectures.map(lecture => <option key={lecture.id} value={lecture.id}>{lecture.id} · {lecture.title}</option>)}</select></label>}
    </div>}
    <button type="button" className="secondary" onClick={() => setRefresh(value => value + 1)}>Refresh rankings</button>
    {error && <p className="quiz-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading first-attempt scores…</p>}
    {data && <>
      {data.yourEntry ? <p className="quiz-your-rank">Your rank: <strong>#{data.yourEntry.rank}</strong> · {data.yourEntry.points.toFixed(2)} points · {data.yourEntry.quizzes} quizzes</p> : <p>Complete a first quiz attempt to appear here. Staff practice attempts do not enter student rankings.</p>}
      {data.rows.length ? <div className="quiz-table-scroll"><table><caption>{quizKey ? 'Students who completed this quiz' : 'Students in this course'} · {data.totalStudents} ranked</caption><thead><tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col">Points</th><th scope="col">Topics</th><th scope="col">Lectures</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.userId} className={row.isYou ? 'quiz-is-you' : undefined}><td>#{row.rank}</td><th scope="row">{row.label}{row.isYou && ' (you)'}</th><td>{row.points.toFixed(2)}</td><td>{row.topicQuizzes}</td><td>{row.lectureQuizzes}</td></tr>)}</tbody></table></div>
        : <p className="quiz-empty">No first-attempt scores yet. Take a quiz to start the class leaderboard.</p>}
    </>}
  </section>;
}
