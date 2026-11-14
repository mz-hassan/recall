# Papers reader context

The Papers reader is an asynchronous course feature, independent of live lectures. Course assignments are catalog metadata; they are not required to enter the reader. DAgger uses its existing prepared outline, summaries, findings, highlights, and PDF without the teacher service. Other entries generate a guide only when the student opens them, using their local dataset PDF and the teacher service. Entries without a local PDF or usable text show a source link and a clear error instead.

## Experience

The outline is the primary surface. Sections and nested topics start closed so a student can progressively reveal summaries and source links. The original PDF starts collapsed on the left; the unified paper chat opens on the right. Both expand controls fill the viewport, and desktop panels have draggable, keyboard-operable resize handles. Narrow screens use overlay panels. Closing a panel keeps the PDF position and zoom or the chat draft for the current reader session. Diagrams also expand to fill the viewport. Generation and PDF loading show indeterminate progress bars, since exact progress is not available.

Selecting text in the outline or PDF, or clicking a verified PDF highlight, exposes a contextual Explain popup. Explain opens the PDF at the corresponding source, attaches the selection, and sends a question to the teacher. Chat can also be used directly with the PDF closed. Responses cite prepared passages; citations and diagram nodes open their source. The teacher may add removable PDF annotations or conceptual diagrams immediately. Diagrams include a text alternative and can be expanded into a modal. The model decides when a diagram is useful; the client never executes model-generated UI code.

## Code map

- `catalog.js` builds course paper identities and assignment metadata from the manifest; `PapersPage.jsx` presents the catalog.
- `ReadingPage.jsx` coordinates selection, source navigation, panel state, requests, and saved reader state. `components/` contains the outline, PDF, panels, selection popup, and diagram renderer. `api.js` calls the teacher endpoint.
- `data/dagger.js` is the curated DAgger breakdown and anchors. `data/dagger-pages.json` holds extracted text and page geometry. Highlights are displayed only when the PDF fingerprint matches the prepared edition.
- `state.js` keeps chat and teaching aids in memory during in-app navigation and saves page/highlight preferences in local storage. It does not persist conversations across reloads.
- `server/src/features/readings/` contains the Fastify route, on-demand PDF extraction and generation, service, a single structured-call teacher harness, prompt, offline fixtures, and tests. Generated guides use page-level citations and are cached in server memory until restart; they are not manually verified or persisted. Extraction is capped per page and reports truncation. Both the guide and the teacher call the shared `ModelProvider` (`generateStructured`) selected by `LLM_PROVIDER`; the shared adapter owns retries, so invalid output ends in a readable error. The teacher retrieves evidence server-side, validates citations and diagram references in its schema, and registers fixture answers for the offline `fixture` provider. `shared/contracts/readings.ts` defines the data exchanged with the client.

The extracted PDF text can contain damaged mathematics, reading order errors, and missing figures. Generated claims and their page citations should be checked against the original; generated guides do not include verified highlight rectangles. PDF retrieval errors leave an original-source link available. General PDF uploads, durable generated guides or chat storage, and figure reconstruction are not implemented.

## Run and verify

From the repository root, install dependencies and run `npm run dev`, which starts the frontend and the API on 127.0.0.1:8787 (Vite proxies `/api`). The paper teacher uses the same provider settings as the rest of the server: the default `LLM_PROVIDER=fixture` answers offline with clearly labelled stub text, and `LLM_PROVIDER=deepseek` with `DEEPSEEK_API_KEY` (see `.env.example`) enables real explanations and on-demand guides. Open the course Papers tab and select DAgger, or visit `/#paper/ai/ai-dagger`. The prepared DAgger guide needs no backend. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run test:e2e` for the relevant checks. Browser tests use Chromium and mocked teacher responses. `node --env-file-if-exists=.env scripts/check-teacher.ts --decisions` makes live model requests when `LLM_PROVIDER=deepseek` to exercise text-versus-diagram decisions and incurs provider usage. `npm.cmd run prepare:reading` regenerates extraction from the dataset PDF; curated ranges and claims must be rechecked against the source after regeneration. `node scripts/verify-reading.mjs` renders annotated pages for visual inspection.

Browser coverage includes expanded PDF, chat and diagram views, source navigation, selection, loading and missing-source fallback. The graph is mounted after the modal opens so it can fit the measured viewport.
