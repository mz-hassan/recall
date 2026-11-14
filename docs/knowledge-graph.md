# Course knowledge graph

The graph reads completed lecture materials from `datasets/cs690s/`. DeepSeek extracts concepts and typed relationships; MongoDB stores generated graph documents, citation excerpts/references, and indexing metadata. Full transcripts, slide decks, and raw extraction inputs stay in the dataset. Nothing is indexed until a completion event is received.

The extraction harness supplies numbered evidence spans. DeepSeek cites their IDs, and the backend resolves those IDs to verbatim source text and character offsets. Invalid IDs or graph endpoints receive one repair attempt before the update fails; invented quotations are never published.

The provider adapter also validates JSON and the full output schema before returning data. Invalid JSON or unsupported relationship types receive corrective feedback within a maximum of three request attempts. Unknown relationships are not silently mapped to another meaning. Exhausted retries produce a concise UI message; field-level validation diagnostics and attempt usage are retained in indexing metadata.

A separate whole-lecture selection step keeps only the main teaching topics: normally 4–6 concepts, with a hard limit of six per lecture and eight relationships between them. Focused lectures may have fewer. Notation, formula components, examples, recaps and incidental mentions are excluded; umbrella topics are preferred over their individual variants. Detailed candidates remain extraction checkpoints and do not appear in the published graph. The final selection retains the validated source evidence. A longer transcript does not increase the displayed per-lecture budget.

Each selected concept also receives a short explanation grounded in its lecture evidence. Summaries are generated during indexing and stored with the graph, so selecting a node shows the explanation immediately without a model request. The side panel displays Summary first; Sources is collapsed by default and resets closed when selecting a different concept.

Search and filters keep the same canvas and node positions. Nonmatching elements fade away while the viewport animates into the matching neighborhood; clearing search animates back. Fast successive edits interrupt the current transition instead of queueing camera movements. Zoom/Fit buttons use the same easing, and the operating system's reduced-motion preference disables these transitions.

## Local setup (no Docker)

Use Node.js 22.18+ (Node 24 recommended), then:

```sh
npm ci
cp .env.example .env
```

Edit `.env` and set `DEEPSEEK_API_KEY`. Keep credentials server-side. The configured model is `deepseek-flash`, the API identifier for the Flash model documented by [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/). You can change `LLM_MODEL` and `DEEPSEEK_BASE_URL` without changing the graph UI.

Start MongoDB in its own terminal:

```sh
npm run db:start
```

This launches a **native MongoDB 8.0.17 process**, bound to `127.0.0.1:27017`, with durable files in `.local/mongodb/`. The helper uses the `mongodb-memory-server` package to download/manage the native binary; despite its name, this command explicitly uses a persistent WiredTiger data directory. The first run needs internet access for the binary download. Ctrl+C stops MongoDB and preserves the data. Do not run a second MongoDB process against this directory.

An existing native MongoDB installation can be used instead: start it yourself and set `MONGODB_URI` / `MONGODB_DB`. No MongoDB account is required for the bundled local setup.

In another terminal:

```sh
npm run dev
```

Open the URL Vite prints, choose **AI Alignment → Knowledge graph**. The API listens on `127.0.0.1:3001`; Vite proxies `/api`. These are local development services. They are not configured as a public authenticated deployment.

The shared API starts live lecture independently of MongoDB. If graph database initialization fails, graph requests return an unavailable message while live lecture stays usable. Start MongoDB and restart the API to restore graph indexing. Both features use the DeepSeek settings from `.env`.

## See the graph update before live lecture integration

With the graph page open, send completion for an existing dataset lecture:

```sh
npm run graph:complete -- 1 1
```

The arguments are `lectureId revision [courseId]`, with `ai` as the default course. The graph shows indexing progress and then the generated concepts. Add reinforcement learning:

```sh
npm run graph:complete -- 3 1
```

The page refreshes automatically every two seconds, highlighting newly added concepts/edges. Select a node, inspect citations, filter by lecture or relationship, or use the keyboard-accessible concept/connection lists. New source references may be added to existing concepts even when no new nodes are needed.

Running the same completion twice does not repeat successful extraction with the same pipeline version. A changed overview/prompt version can rebuild the same completed material revision; unchanged candidate checkpoints are reused. After changing transcript/slides or adding delayed slides, save the files and manifest, then increment the lecture revision:

```sh
npm run graph:complete -- 3 2
```

The old graph remains visible while the replacement is processed. Failed jobs can be retried from the graph page after fixing the cause. If files changed, send a higher revision instead. The command acknowledges the job; it does not wait for extraction. Check the graph page for completion/error status. No API key means jobs fail with a configuration message; there is no fake graph fallback.

## Handoff for the live lecture teammate

1. Finish saving the lecture's transcript, slides, and manifest entry. Write temporary files and rename them into place, then save the manifest last. Do not send events for in-progress chunks.
2. Use the manifest lecture number as `lectureId` (string). Preserve `courseId: "ai"` for this dataset. Assign a **positive, monotonically increasing integer revision per lecture**, starting at `1`.
3. Once all files are readable, send:

```http
POST /api/graph/lecture-completed
Content-Type: application/json

{"courseId":"ai","lectureId":"3","revision":1}
```

From a backend process, call `http://127.0.0.1:3001/api/graph/lecture-completed`. From the frontend in Vite, use the relative URL. Example:

```js
const response = await fetch('http://127.0.0.1:3001/api/graph/lecture-completed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 'ai', lectureId: String(lectureNumber), revision }),
});
if (!response.ok) throw new Error((await response.json()).error);
const { job } = await response.json();
```

An accepted event returns `202 { job }`; an already completed duplicate returns `200 { job }`. This acknowledges indexing, not completion. Retry network errors with the **same revision**. The same event coalesces while queued/running; failed jobs with unchanged materials can also be retried with the same event. Changed files under an existing revision and stale revisions return `409`. Missing/unreadable materials return `422`; malformed events return `400`.

4. For transcript corrections or delayed slides, finish saving the new files and manifest and send the next revision. Material hashes prevent reprocessing identical evidence, and the replacement removes obsolete lecture citations while preserving contributions from other lectures.

The trigger is implemented and ready to call. This work does **not** modify the teammate's live lecture controls or send a completion event when the existing demo replay ends.

## Dataset source contract

The adapter reloads `datasets/cs690s/manifest.json` for every completion. It uses the existing `lectures[]` entries: `number`, `title`, `transcript.files`, `slides.files`, and optional `source_url` fields. It supports transcript TXT (preferred) or VTT, and slide TXT (preferred) or text-based PDF. When slide TXT extracts are listed, keep them current with the PDFs: the reader prefers the extracts. Paths are relative to the dataset root and may not escape it, including through symlinks.

PDF fallback extracts individual pages and retains page numbers. Existing TXT extracts have character-span citations without invented page numbers. Image-only slides need a text extract from the live pipeline; this implementation does not perform OCR or claim to inspect slide images. Assigned readings are not indexed by this completion handoff.

Source links open the cited text from the folder and verify its hash. If it has changed since indexing, the API returns a recoverable stale-citation message rather than showing mismatched evidence. Original slide URLs are also available when recorded in the manifest. Lecture navigation remains available from citations.

To replace the folder with another datasource later, implement `LectureSource.load(courseId, lectureId)` and `.list(courseId)` in `server/src/data/` and inject it into `GraphService`. The completion contract, extraction, MongoDB storage, and UI do not need to change.

## Storage and recovery

`concepts` and `conceptEdges` contain course-scoped IDs and cited typed links. `graphHeads` points to the published version and holds lecture revision/hash metadata. `graphJobs` stores progress, errors, model/prompt version, latency and usage metadata. `graphSegments` checkpoints validated generated concepts/relationships so retries reuse successful extraction segments. `graphWorkerLease` prevents competing local API processes. Full source text and raw slide PDFs are never copied into these collections; short quoted evidence is part of the generated graph.

Updates are serialized. A complete immutable graph version is staged before atomically switching the course head, so readers never see a partially published revision. Prior version documents are retained; automatic storage compaction is not implemented. Queued/interrupted jobs recover on API restart. A recovered job whose graph was already published is marked complete without repeating model calls. Gracefully cancelled jobs appear as failed and can be retried.

Adding or modifying files alone does not trigger indexing: the completion event is the boundary. Initial historical lectures also need completion events. A provider/prompt change can be evaluated and reindexed by sending a higher lecture revision.

Moment/artifact persistence and links remain a later milestone. The current completion revision belongs to dataset materials and does not pretend to be a saved timeline revision.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:graph:browser
```

Node/API tests use deterministic model fixtures, including BC/RL deduplication, duplicate completion, correction/delayed slides, source validation, stale events, restart recovery, and native MongoDB integration in an isolated temporary database. The integration test downloads a native MongoDB binary if needed and does not touch your local `recall` database. The browser test uses installed Google Chrome, isolated services and fixture extraction to verify progress, additions, filtering, retry and mobile layout. It saves screenshots to `/tmp/recall-graph-desktop.png` and `/tmp/recall-graph-mobile.png`.

Real DeepSeek quality and end-to-end extraction require a local key and must be evaluated with the chosen model. Fixture checks do not establish model quality.
