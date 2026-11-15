# Shared notes and saved lecture accounts

Start the configured MongoDB (`npm run db:start` for the bundled local setup), then
`npm run dev`. The normal API uses `MONGODB_URI` and `MONGODB_DB` from `.env` for
accounts, shared study notes, personal lecture histories and the existing graph.
No new cloud service or credentials are required.

## Open notes

Sign in, add AI Alignment or Computer Vision, and select a lecture title in the
course overview, or **Study notes** under Course material. Notes use the existing
lecture timeline, including summaries, intuition, supported equations, matched slides,
diagrams, questions and requested visuals. They do not start a simulated live lecture.

The current database contains 23 AI Alignment lecture note sets and six usable
Computer Vision recordings. Twelve AI lectures have transcripts; the remaining
eleven are explicitly labeled preparation notes from available slides/readings.
Computer Vision recording titles come from their content. Their lecture numbers and
dates could not be established, so imported recordings are numbered without fabricated
dates. Empty VTT files are skipped. Generated notes should be checked against sources.

Prepared notes are shared by enrolled users of the same Recall server/database.
They are not browser-local caches. Independent deployments need the same reachable
MongoDB connection to share them; pulling Git alone does not copy the database.
The configured local WiredTiger data lives in ignored `.local/mongodb/`. Back up that
directory while MongoDB is stopped, or use your normal MongoDB backup process.

## Generate or refresh

AI source material stays in `datasets/cs690s/`. Import Computer Vision VTTs from an
existing folder before regenerating; raw imports stay out of Git:

```sh
node --import tsx scripts/import-cv.mjs "path/to/COMPSCI670/transcripts"
node --import tsx --env-file-if-exists=.env scripts/prepare-course-notes.mts ai cv
```

The command uses the configured provider, with two jobs at a time. It processes
transcripts and bounded extracts from assigned slides/readings, validates source IDs
and slide page numbers, and saves concise topic summaries and provenance in MongoDB.
Content hashes skip unchanged source material. Use `--force` to regenerate, or
`ai --lecture=12` to retry a particular lecture. Model calls send source text to the
configured provider. Credentials never enter browser code or generated files.

## Personal live data

Sign in before opening CS50 and starting the microphone. Each account has an isolated
runtime. Timeline changes queue MongoDB checkpoints; transcript text, source spans,
topic revisions, cumulative summaries and session state are saved. Audio remains
local/in memory and is not archived. Chat, recognition and topic processing remain
independent. A new recording gets a new run ID and retains the preceding run in storage.

The latest timeline resumes on reload. After an API restart, a saved run is readable
as completed; an interrupted summary falls back to its last good summary/transcript.
The microphone must be started explicitly to capture again. Prepared-note overlays
keep each user's attached visuals separate from the shared course notes.

Collections:

| Collection | Stored data |
| --- | --- |
| `users`, `auth_sessions` | Account/membership, salted password verifier, hashed expiring cookie token |
| `course_notes` | Shared per-lecture notes, evidence text/spans, generation/model metadata |
| `lecture_runs` | User/run-scoped snapshots, transcript chunks, running summary and session state |
| `lecture_chats` | Completed questions, selected context, short answers and citations |
| `lecture_doubts` | User/course/lecture/run/moment association for actual unclear marks |
| `lecture_artifacts` | Owner/run-scoped chart/animation specs and evidence citations |
| `lecture_slide_notes` | Owner/run/moment/revision-scoped slide highlights and explanations |

`GET /api/account/runs` lists the owner's saved run metadata;
`GET /api/account/runs/:runId` reads an owned checkpoint. The normal timeline currently
opens the latest run. Saved questions restore in the chat panel. Students see their
own doubts; course staff can see course doubt counts, without access to private chats
or other users' run archives. The existing prototype still lets people select a staff
role; institutional role verification and email verification are separate work.

Integration tests use an isolated temporary MongoDB and a fixture provider. They
verify account boundaries and recovery after API/repository restart without touching
the configured course database or making paid model calls.
