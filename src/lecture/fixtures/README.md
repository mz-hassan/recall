# Helly H1 fixture stream

The normal **Simulate live** action now uses the server (H2). The H1 offline demo
remains available as a recorded frontend-only stream based on the existing authored
Lecture 02 moments. It starts paused with one moment visible,
uses an eight-second interval, and defaults to six moments. Open
`lecture.html?lecture=2&mode=live&transport=fixture`; use `interval=1` for a quick check or `limit=all`
for all seven authored moments. Settings for this fixture use moments rather than
word chunks. Other lectures retain their existing transcript replay.

Each moment arrives as a pending transcript excerpt and receives its authored notes
in a later revision. The fixture is not an AI service. Original quote references
are retained; the timeline clock is a simulation offset. **Reconnect stream**
reopens the fixture at the last accepted event without resetting the clock or view.
Restarting playback after completion starts a fresh recording.

## Shared contract and fixture transport

All files here and `api.js`, `streamState.js`, and `hooks/useLectureStream.js` are
frontend-only. Events are validated directly with `shared/contracts/lecture.ts`
from main. Shared contracts, backend routes and backend dependencies are unchanged.

- The fixture emits `timeline.snapshot`, `moment.upsert`, and `session.state`.
  Numeric event `seq` is the reconnect cursor, matching main's SSE contract.
- A moment's `status` is `open` or `closed`; `enrichment` separately tracks
  `none`, `pending`, `ready`, or `failed`. Each upsert contains the complete moment.
- Published IDs, order and start times stay stable. The newest revision wins.
  A stale revision still advances the event cursor; duplicate events do not.
- Missing notes leave the original quote readable. Runtime text is rendered as
  plain React text. Only static, hand-authored past replay data uses legacy HTML.
- Attachment URLs may be relative or HTTP(S); executable URL schemes are rejected.
- Fixture excerpts have empty `sources` because exact spans were not recorded in
  the curated demo. `quoteTime` retains original references; `timeSource` is
  `simulated`. Fixture `chunkSeqs` identify authored excerpts, not dataset chunks.
- Snapshots restore the current run. A snapshot for a different run can reset the
  cursor after a server restart. Revisions and ordering stay stable within a run.

`createFixtureStream` implements `connect({ afterSeq, onEvent, onStatus })`
returning `{ advanceTo, close }`. The clock is controlled by React and pauses
delivery as well as visual playback. H2 uses `createServerStream` at the same seam
with main's real SSE endpoint and HTTP playback commands. The offline demo makes
no live API requests.

## Checks

`npm test` runs the deterministic replay/merge tests with no credentials or backend.
`npm run build` verifies frontend integration. In the browser: open the live fixture,
press Play, expand an older moment, scroll its detail, wait for the next arrival,
then reconnect. Selection and detail scroll should stay put. Check the curated past
timeline and another lecture's transcript replay as regressions.

Chat requires a real server session. Artifact requests remain a later milestone.
