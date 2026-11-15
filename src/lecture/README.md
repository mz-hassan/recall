# Helly live lecture: H1 through H5

Run `npm ci` and `npm run dev` with Node 22.18+ (the local checks used the existing
Node 24 runtime). Main's Vite proxy connects the page to Fastify on port 8787.
KaTeX renders equations and Playwright runs the desktop/mobile checks. Pipeline
contracts remain unchanged; the store preserves student attachments on later revisions.

## Real stream (H2)

Open `lecture.html?lecture=2&mode=live`. The page resumes the server's existing
session, including a paused or completed session. If none exists, it creates a
paused replay with the URL's settings: 160 words, 8 seconds, 6 chunks by default.
The server owns playback and sends snapshots, moment revisions and session state.
Topic count can differ from transcript chunk count because segmentation groups chunks.
Open topics receive cumulatively updated summaries as speech arrives; pending revisions retain the last good summary. Superseded revisions are coalesced. Raw transcript appears only through the fallback control when summary generation fails. Slide image references
expand in the page; PDF references open the original PDF at its cited page. Low-confidence
slide matches are labelled as possible matches.

Play and Pause use the existing HTTP commands. **Restart replay** creates a new
paused run with the current session's settings. **Apply & restart** applies the
settings form to a new run. It removes the one-shot `restart=1` flag after success
so refreshing the resulting URL resumes instead of restarting again.

EventSource connections automatically retry after two seconds, resuming with
`?after=<last validated seq>`. Manual reconnect uses the same cursor. Invalid
events leave the existing timeline readable and offer retry. A server restart
can reset the stream to an empty snapshot; use Restart replay to begin again.
Storage is still main's in-memory store, so sessions do not survive a server restart.

The [offline H1 fixture](fixtures/README.md) remains available with
`transport=fixture`. The original curated past replay is unchanged.

## Contextual chat (H3)

Expand a streamed moment and choose **Ask about this**. Select **This moment** or
**Last 3 minutes**, then ask a question. **What did I miss?** fills the recent-context
recap question. The assistant retrieves raw transcript chunks, related moments and
the running summary through the existing lecture store. It uses the configured
shared provider; fixture mode returns clearly labelled deterministic excerpts.
DeepSeek uses the adapter already on main, configured in the server's own `.env`.
Keys never enter frontend code. The checks use fixture mode and make no paid calls.

Last 3 minutes ends at the latest available transcript chunk, not wall-clock time.
VTT data uses recording timestamps; untimed TXT replay uses simulated offsets.
Retrieval includes chunks that overlap the range, so a boundary chunk may include
words outside it. Context is bounded for model requests. Curated offline fixtures
and legacy past replay do not silently create server sessions for chat.

The shared student-side contract is `shared/contracts/lectureInteractions.ts`.
`POST /api/lectures/:courseId/:lectureId/chat` accepts `{ runId, question, context }`,
where context is `{ kind: 'moment', momentId }` or `{ kind: 'recent', seconds: 180 }`.
Answers include plain text, canonical moment citations, range/time source and provider
metadata. Clicking a citation selects its moment without discarding the answer.
Questions are limited to 2000 characters; chat request bodies are limited to 16 KiB. Answers normally use 1–3 short sentences and are bounded to 90 words.
Empty context, stale runs, unsupported citations and provider failures have recoverable
responses. Client cancellation and a 60-second request budget bound in-flight work.

Chat state is kept in the open panel and is not persisted. The app and feature entry
point pass the existing provider to student-side routes. Pipeline and provider logic
stay intact; the approved store change retains attachments across topic revisions.

## Artifacts (H4)

Expand a streamed moment and choose **Request an artifact**. Select **Chart** or
**Animated diagram** and describe what would help. The harness retrieves that moment's
evidence, validates the model's output, and attaches a saved spec and citations to the
same moment. Use Previous/Next or Play/Pause to explore an animation. Charts include
an accessible data table. KaTeX renders valid formulas; invalid formulas fall back to
readable text. No model-generated JavaScript, HTML or SVG executes in the browser.

`POST /api/lectures/:courseId/:lectureId/artifacts` accepts
`{ runId, requestId, momentId, kind, prompt }`. The UUID request ID makes retries
idempotent within a run. `GET .../artifacts/:artifactId?runId=...` restores the saved
spec after a browser reload. Pending requests use a 60-second budget and cancellation.
Source citations are checked against retrieved moment IDs; unrelated requests and
unsupported evidence fail without attaching a visual. Illustrative chart values are
labelled separately from evidence-derived values. Fixture visuals use deterministic
source word counts or transcript review steps, and identify themselves as fixtures.

The current in-memory architecture retains specs only for the server session. A new
lecture run invalidates old artifact references; a server restart clears all sessions.
Later pipeline revisions preserve existing artifacts. Durable storage remains future work.

## Checks

- `npm run typecheck`: shared and server modules.
- `npm test`: pipeline regressions, fixture replay, merge/reconnect handling, session
  initialization, chat retrieval/citations, stale runs and registered chat route.
- `npm run build`: frontend integration with browser-safe shared schemas.
- `npx playwright install chromium` then `npm run test:e2e`: H5 desktop/mobile
  tests for replay at several speeds, stable rewind and detail scroll, notes fallback,
  chat citations, artifacts/reload/retry, and equation rendering. CI installs Chromium
  with its system dependencies and runs this same suite.
- Browser tests start their own fixture API (8791) and web server (4175), never read
  the developer's provider configuration, and leave the normal dev server alone.
- Browser checks: play/pause, stable rewind/detail scroll, reconnect, resume, restart
  and settings, recent/selected chat, citation navigation, retry, offline demo and mobile.
