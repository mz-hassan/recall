# Code ownership and stack

The graph now implements the TypeScript/Fastify foundation, shared graph contracts, provider interface/DeepSeek adapter, MongoDB graph repository, and dataset adapter. See [graph setup and completion integration](knowledge-graph.md). Other backend modules below remain planned. Create them as their work starts; do not install every suggested dependency or rewrite the working UI up front. Deployment is out of scope for now.

## Stack direction

| Layer | Direction | Scope |
| --- | --- | --- |
| UI | Keep React 19, Vite and existing CSS animations | Preserve the current interaction; introduce TypeScript incrementally for new shared/backend code. |
| API | Node.js 22.12+, TypeScript, Fastify | One local backend, feature-specific route modules; HTTP commands and server-sent events for timeline updates. |
| Contracts | Zod with JSON Schema export | Validate harness outputs and API boundaries; schema definitions are developer-owned, never model-generated. |
| Persistence | MongoDB with the official Node driver | Local MongoDB initially or an optional Atlas connection; repository adapters keep features independent of the database. |
| Models | Shared provider interface, fixture/DeepSeek adapters, Gemini later | Configure provider and model server-side; feature-specific harnesses own prompts, retrieval and evaluations. |
| PDFs | Existing text extracts first; PDF.js when page extraction/rendering is needed | Retain file/page citations and original PDF links. |
| Course graph | Cytoscape.js inside a React feature component | Suggested implementation for node/edge navigation and layout; retain an accessible connection list. |
| Equations and artifacts | KaTeX, SVG, and a small vetted chart renderer | Accept validated data/specs; no arbitrary generated JavaScript in the app. |
| Checks | Existing Node tests; add API/contract tests and targeted browser flows as features land | Keep fixtures deterministic and API-free by default. |

No separate time-series database or agent orchestration framework is required initially. MongoDB can hold ordered lecture events and task status; add infrastructure only when measured requirements justify it. Vector retrieval is a later enhancement, not a prerequisite for dataset-backed work.

## Directory ownership

Paths marked **planned** do not exist yet. Create a feature's own files in its reserved location rather than adding everything to a shared entry point.

| Owner | Current entry points | Planned implementation locations |
| --- | --- | --- |
| Reading breakdowns | `src/readings/ReadingPage.jsx` | `src/readings/components/`, `src/readings/api.js`, `server/src/features/readings/` |
| Course knowledge graph | `src/graph/CourseGraphButton.jsx` | `src/graph/CourseGraphPage.jsx`, `src/graph/components/`, `src/graph/api.js`, `server/src/features/graph/` |
| Live and past timelines | `src/lecture/main.jsx`, `MomentExtras.jsx`, `replay.js`, `dataset.js` | `src/lecture/components/`, `src/lecture/hooks/`, `src/lecture/api.js`, `server/src/features/lecture/` |
| Shared shell (coordinate changes) | `src/library/main.jsx`, `src/library/content.js`, `src/ui.jsx`, `src/storage.js` | `src/api/client.js` for transport only |
| Shared backend foundation (coordinate changes) | None | `server/src/app.ts`, `server/src/config.ts`, `server/src/llm/`, `server/src/data/`, `server/src/db/` |
| Shared contracts (coordinate changes) | Existing moment fixture in `src/lecture/main.jsx` | `shared/contracts/{sources,readings,graph,lecture}.ts` |

Within each backend feature use `routes.ts` for transport, `service.ts` for orchestration, focused harness files for model tasks, `prompts/` for versioned instructions, and `__tests__/fixtures/` for small evaluation inputs/outputs. Graph's future completed-lecture indexing lives in `server/src/features/graph/indexCompletedLecture.ts`, not a new integration feature.

Put reusable dataset loading in `server/src/data/`, database connections and repositories in `server/src/db/`, and all vendor SDK imports in `server/src/llm/`. Features may import shared contracts/services, but must not import another feature's prompts or internal implementation. Use an explicit service contract for cross-feature calls. The shared contracts module must not import server-only code so browser consumers cannot bundle secrets or drivers.

Keep feature-specific styles inside their feature folder and namespace class names. Put tests next to the owning module. Avoid broad edits to page entry points: register the component or route, then keep implementation in its feature. Agree on shared schema changes in the PR before parallel features depend on them.

## MongoDB plan

Graph uses a repository interface with MongoDB in the application and an isolated fixture implementation for tests. Server-only `MONGODB_URI` and `MONGODB_DB` configure storage. As agreed for the current graph implementation, only generated graph data/citations and indexing metadata are persisted; lectures and full source text are read from the folder through a replaceable source adapter. The broader collections below remain a future storage plan. Do not move or delete the checked-in dataset.

Suggested collections and identifiers:

| Collection | Purpose and identity |
| --- | --- |
| `courses`, `lectures` | Course metadata; lecture identity is `(courseId, lectureId)` using the manifest number. |
| `sources` | Required/optional materials, original URL, local file reference, extraction version and page metadata. |
| `readingBreakdowns` | Structured sections keyed by source ID and generation revision. |
| `transcriptChunks` | Ordered source spans with `(courseId, lectureId, chunkId)` identity. |
| `moments`, `artifacts` | Stable lecture-scoped IDs, revisions and source citations; artifacts reference their owning moment. |
| `concepts`, `conceptEdges` | Course-scoped concept IDs, aliases and typed, cited relationships across lectures. |
| `conceptLinks` | Future references from concepts to completed lecture moments/artifacts; do not duplicate their content. |
| `jobs` | Task status, attempts, prompt/model version and indexed timeline revision for retries. |

Create unique indexes for stable scoped IDs and event/revision keys, with query indexes for lecture time order and concept endpoints. Keep one logical graph per course, stored as node/edge documents rather than one huge embedded graph. Store PDFs and images as file references for now; never put an entire course's transcript or base64 PDFs into a single document. MongoDB documents have a [16 MiB limit](https://www.mongodb.com/docs/manual/reference/limits/), and [manual references](https://www.mongodb.com/docs/manual/reference/database-references/) allow related records to remain separate.

Apply moment revisions idempotently; record completed timeline revision and indexing status. A future graph job indexes only a saved completed lecture revision, then links its moments/artifacts to concepts. Repeated jobs must upsert the same links. Later artifacts or corrections schedule reindexing of the completed lecture. Graph consumers should only expose a fully indexed revision, not partially written results.

If semantic retrieval is needed later, evaluate Atlas vector/hybrid search over source chunks with course filters and source citations. Track embedding model/version separately from the generation provider; swapping Gemini for DeepSeek must not silently mix incompatible embeddings.

## Shared foundation TODOs

- [x] Introduce TypeScript configuration for `server/` and `shared/` without forcing a frontend rewrite.
- [ ] Define versioned source, moment, artifact, reading and graph schemas with fixture validation.
- [x] Add a local Fastify API with independently registered feature routes and a documented local start command; configure Vite's development proxy then.
- [ ] Implement fixture provider/repositories first, then provider adapters and MongoDB repositories behind the same interfaces.
- [x] Add `.env.example` with blank server-only credentials when the backend exists; keep real `.env` files ignored.
- [ ] Add bounded retries, cancellation, validation and per-task evaluation metadata.
- [ ] Later: add course-site ingestion into the existing manifest and storage contracts.

Use [Fastify's validation guidance](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) for API schemas and the [harness guide](agent-harnesses.md) for provider-specific schema adaptation. Claim shared foundation tasks explicitly so multiple collaborators do not build competing API servers or database clients.
