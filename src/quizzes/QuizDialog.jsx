import React, { useEffect, useRef, useState } from 'react';
import { startQuiz, submitQuiz } from './api.js';
import { Leaderboard } from './Leaderboard.jsx';
import './quizzes.css';

export function QuizDialog({ options, onClose }) {
  const dialog = useRef(null), controller = useRef(null), identity = useRef(crypto.randomUUID());
  const [quiz, setQuiz] = useState(null), [answers, setAnswers] = useState({});
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [ranks, setRanks] = useState(false);
  const practice = useRef(false);
  useEffect(() => {
    const element = dialog.current; element.showModal();
    return () => { controller.current?.abort(); element.close(); };
  }, []);
  async function open(retake = false) {
    if (pending) return;
    if (practice.current !== retake) { identity.current = crypto.randomUUID(); practice.current = retake; }
    const cancellation = new AbortController(); controller.current?.abort(); controller.current = cancellation;
    setPending(true);setError('');
    try { const result = await startQuiz(options, identity.current, retake, cancellation.signal);
      if (!cancellation.signal.aborted) { setQuiz(result);setAnswers({});setRanks(false);dialog.current.scrollTop = 0; }
    } catch (failure) { if (!cancellation.signal.aborted) setError(failure.message); }
    finally { if (!cancellation.signal.aborted) setPending(false); }
  }
  async function submit(event) {
    event.preventDefault();if (pending) return;
    const cancellation = new AbortController();controller.current = cancellation;setPending(true);setError('');
    try { const result = await submitQuiz(quiz.id, answers, cancellation.signal);if (!cancellation.signal.aborted) { setQuiz(result);dialog.current.scrollTop = 0; } }
    catch (failure) { if (!cancellation.signal.aborted) setError(failure.message); }
    finally { if (!cancellation.signal.aborted) setPending(false); }
  }
  const result = quiz?.result;
  return <dialog ref={dialog} className="quiz-modal" aria-labelledby="quiz-title" onCancel={event => { event.preventDefault();onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
  }}>
    <button type="button" className="quiz-close" aria-label="Close quiz" onClick={onClose}>×</button>
    <div className="quiz-shell">
      <div className="eyebrow">{options.scope === 'topic' ? 'TOPIC QUIZ · 10 POINTS' : 'LECTURE QUIZ · 100 POINTS'}</div>
      <h2 id="quiz-title">{quiz?.title || (options.scope === 'topic' ? 'Check this topic' : 'Check the whole lecture')}</h2>
      {ranks ? <><button type="button" className="secondary" onClick={() => setRanks(false)}>Back to results</button><Leaderboard courseId={options.courseId} quizFilter={{ lectureId: options.lectureId, quizKey: quiz.quizKey }}/></> : !quiz ? <>
        <p>{options.scope === 'topic' ? '2–10' : '8–15'} multiple-choice questions, sized to the saved lecture material. Each question has one correct answer.</p>
        <p>Extra coverage goes to your doubts, class doubt trends, and key concepts. Every question within this quiz counts equally.</p>
        <p>Your first submitted attempt counts toward the course leaderboard. Closing an unfinished quiz keeps the same questions available; retakes are for practice.</p>
        <button type="button" className="primary" disabled={pending} onClick={() => open(false)}>{pending ? 'Preparing your quiz…' : 'Start quiz'}</button>
      </> : <>
        <p className="quiz-attempt-label">{quiz.ranked ? 'First attempt · counts toward your course rank' : quiz.firstAttempt ? 'Staff practice · not ranked' : 'Practice retake · does not change your rank'}{quiz.provider === 'fixture' && ' · Offline fixture questions'}</p>
        <details className="quiz-coverage"><summary>Question coverage and priorities</summary><ul>{quiz.coverage.map(topic => <li key={topic.topicId}>{topic.title}: {topic.questions} {topic.questions === 1 ? 'question' : 'questions'}{topic.personalDoubt && ' · Your doubt'}{topic.classDoubt && ' · Class doubts'}{topic.important && ' · Key concept'}</li>)}</ul></details>
        {result ? <>
          <div className="quiz-score" role="status"><strong>{result.points} / {quiz.maxPoints}</strong><span>{result.correct} of {result.total} correct · {result.percentage}%</span></div>
          <p>{quiz.ranked ? 'This first-attempt score is saved in the course leaderboard. It will not change on a retake.' : 'Practice result saved. Course rankings are unchanged.'}</p>
          <div className="quiz-result-actions"><button type="button" className="secondary" disabled={pending} onClick={() => {if(!error)identity.current=crypto.randomUUID();open(true);}}>{pending ? 'Preparing practice…' : 'Practice again'}</button><button type="button" className="secondary" onClick={() => setRanks(true)}>This quiz leaderboard</button><a href={`./#leaderboard/${options.courseId}`}>Course leaderboard ↗</a></div>
          <ol className="quiz-review">{quiz.questions.map(question => { const review = result.review.find(item => item.questionId === question.id);return <li key={question.id}>
            <span className={review.correct ? 'quiz-correct' : 'quiz-wrong'}>{review.correct ? 'Correct' : 'Review this idea'}</span><h3>{question.prompt}</h3>
            <p>Your answer: {question.options[review.selected]}</p>{!review.correct && <p>Correct answer: {question.options[review.correctIndex]}</p>}
            <p>{review.explanation}</p><details><summary>Lecture evidence · {question.topicTitle}</summary><blockquote>{review.sourceQuote}</blockquote></details>
          </li>; })}</ol>
        </> : <form onSubmit={submit}>
          <p className="quiz-progress" role="status">{Object.keys(answers).length} / {quiz.questions.length} answered</p>
          {quiz.questions.map((question, index) => <fieldset className="quiz-question" key={question.id}>
            <legend><small>{index + 1} · {question.topicTitle}</small>{question.prompt}</legend>
            {question.options.map((option, choice) => <label key={choice} className={answers[question.id] === choice ? 'quiz-selected' : undefined}><input type="radio" name={'question-' + question.id} value={choice} required disabled={pending} checked={answers[question.id] === choice}
              onChange={() => setAnswers(previous => ({ ...previous, [question.id]: choice }))}/><span>{String.fromCharCode(65 + choice)}. {option}</span></label>)}
          </fieldset>)}
          <button type="submit" className="primary" disabled={pending || Object.keys(answers).length !== quiz.questions.length}>{pending ? 'Saving your result…' : 'Submit quiz'}</button>
        </form>}
      </>}
      {pending && <p role="status">{quiz && !result ? 'Your quiz stays open while the result saves.' : 'Building questions from lecture evidence. You can keep the lecture running.'}</p>}
      {error && <p className="quiz-error" role="alert">{error}</p>}
    </div>
  </dialog>;
}
