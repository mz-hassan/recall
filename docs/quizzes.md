# Lecture quizzes and course rankings

Open **Take lecture quiz** from Course material, a lecture row, or the lecture header.
Expand a topic and choose **Take a topic quiz** for that subtopic. Quizzes use the
normal signed-in course workspace and the configured Gemini/DeepSeek provider.
No additional API key is needed. The offline test provider labels its questions as fixtures.

All questions are multiple choice with four options and one correct answer. A topic
quiz contains 2–10 questions and is worth 10 points. A lecture quiz contains 8–15
questions and is worth 100 points. Counts grow with distinct source text: topic
counts are `clamp(1 + ceil(words/400), 2, 10)`; lecture counts are
`clamp(7 + ceil(words/1400), 8, 15)`. If evidence cannot support a valid quiz,
generation fails with a retry instead of saving invented questions or consuming an attempt.

## Coverage

The server plans question coverage before generation. A topic starts with weight 1.
Key/foundation/theory/algorithm concepts, supported equations, or explicit emphasis
cues add 2. The student's own unclear mark adds 4. Other students' distinct marks
add `min(3, log2(1 + students))`; repeated marks by the same student do not multiply
this weight. No classmates' identities, private chats, or exact doubt counts are
sent to the model. Only the requesting student's related saved questions may inform
which concepts to test within their topics.

The plan covers as many topics as the question limit permits, choosing priority
topics first. Extra questions use `weight/(questions already assigned + 1)`. Each
question within an attempt counts equally; priority affects coverage, not marking.
The UI shows which covered topics were personal doubts, class doubts, or key concepts.

Saved prepared notes, curated AI Alignment Lecture 02, legacy transcript timelines,
and owned live/replay runs are supported. A whole-lecture quiz from a live run is
available only after that run completes. Topic quizzes can be taken while listening.
Opening a quiz leaves microphone capture, transcription, and topic updates running.

Generation validates topic allocations, four distinct options, unique question
prompts, and literal supporting quotes from supplied evidence. Options are shuffled
on the server along with their keys. This is an AI study aid, not a proctored or
independently certified examination.

## First attempts and rankings

MongoDB `quiz_attempts` stores the generated questions, private answer keys, source
run, coverage, owner, and submitted answers/review. An atomic first-attempt slot is
keyed by user/course/lecture and quiz scope (or stable topic ID). Reopening a draft
returns the same questions. Closing it does not count as a submission. Unsubmitted
radio choices are currently held in the open dialog; reopening may require choosing
them again. Regenerating notes or restarting the server does not create another
ranked first attempt for the same quiz identity.

Submission is graded server-side and immutable. Concurrent/repeated submissions
return the first committed result. Answer keys, explanations and support quotes
are omitted from draft responses and revealed only after submission. Practice
retakes require a completed first attempt and never add leaderboard points.

The course leaderboard adds points from students' first submitted attempts: topics
up to 10 each, lectures up to 100 each. It rewards both completion and accuracy.
Points are stored as integer hundredths to keep ties consistent; tied totals share
a competition rank (1, 1, 3). Staff attempts are practice only. Enrollment is checked
for every quiz/ranking request, and private attempts are visible only to their owner.
The displayed class is the existing course enrollment; there is no separate section
roster in this prototype. Student labels use the email's local part, not full addresses.

Choose **Quiz leaderboard** on the course page to filter by lecture or quiz type.
Results also link to rankings for that particular quiz. Rankings show the top 100
students and the requesting student's own rank even if they are outside that list.

## API and checks

- `POST /api/courses/:courseId/lectures/:lectureId/quizzes`: `{scope, source, momentId?, runId?, requestId, retake?}`; open/resume first attempt or generate practice.
- `GET /api/quizzes/:quizId`: own attempt, with answer keys hidden until submitted.
- `POST /api/quizzes/:quizId/submit`: `{answers:[{questionId,choice}]}`; choices are indices 0–3.
- `GET /api/courses/:courseId/leaderboard`: optional `lectureId`, `scope`, `quizKey` filters.

`npm test` covers planning, grounding failures, ownership, immutable first scores,
retakes, course isolation and native MongoDB restart recovery. `npm run test:e2e`
adds desktop/mobile quiz flows against a separate fixture API/database on ports
4176/8792, alongside the existing regression server on 4175/8791. Neither fixture
server reads `.env` or uses paid models or the developer's database.
