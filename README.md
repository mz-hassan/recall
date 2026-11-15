# Recall

Recall helps students recover context during a lecture and revisit it afterward. The course library brings together assigned readings, past timelines and a cross-lecture knowledge graph. The live lecture interface groups incoming transcript chunks into moments that can carry summaries, equations, intuition, slides, diagrams and requested artifacts.

The [device and deployment guide](docs/device-test.md) covers the single-server production build, MongoDB, and HTTPS microphone testing.

## Run locally

Use Node.js 22.18 or later (Node 24 recommended). The TypeScript runner supports both backend features.

```sh
npm ci
cp .env.example .env
```

Choose a provider in the server-side `.env` file.

| Mode | Setting | API key | Default model |
| --- | --- | --- | --- |
| Google Gemini | `LLM_PROVIDER=gemini` | `GEMINI_API_KEY` | `gemini-4-hydrogen` |
| DeepSeek | `LLM_PROVIDER=deepseek` | `DEEPSEEK_API_KEY` | `deepseek-flash` |
| Offline demo | `LLM_PROVIDER=fixture` | None | Deterministic fixtures |

Use Gemini for Hydrogen, DeepSeek if you already have a funded DeepSeek project, or fixture mode for a demo without API access. You can keep both keys in the git-ignored `.env`. The selected provider uses only its own key. Leave `LLM_MODEL` blank for the default, or set it to a model ID supported by the selected provider. Clear any previous model override when switching providers.

Restart the API after editing `.env`. The setting controls language generation for lectures, chat, readings, teaching artifacts, and the knowledge graph. CS50 microphone transcription runs on local Whisper. Previously saved MongoDB data stays available. Fixture mode previews the live lecture pipeline and can display saved graphs.

Start MongoDB for accounts, shared notes, lecture histories and graph storage in a separate terminal (no Docker):

```sh
npm run db:start
```

Then start the app:

```sh
npm run dev        # Vite + one shared Fastify API, default 127.0.0.1:3001 (API_PORT in .env)
npm run typecheck
npm test          # graph and live lecture tests, including nested test directories
npm run build
npx playwright install chromium
npm run test:e2e   # desktop/mobile checks against an isolated offline fixture server
```

Sign in and add AI Alignment to your workspace. Select a lecture row to replay its timeline or open **Course material** for sources and **Simulate live**. **Knowledge graph** opens the database-backed course graph. See the [graph setup](docs/knowledge-graph.md) and the [live lecture → graph handoff guide](docs/live-lecture-graph-handoff.md). No Docker is used. `npm run dev:web` runs the frontend alone; `npm run dev:server` runs the shared API. The graph needs MongoDB, but live lecture still runs if the graph database is unavailable. Start MongoDB and restart the API to enable the graph again.

The shared API also exposes transcript replay/streaming, model-backed topic segmentation, topic enrichment, page-exact slides and running lecture summaries. Check it at `http://localhost:3001/api/health`. To run the backend pipelines directly:

```sh
npm run eval:segmentation -- --lecture 2
npm run eval:lecture -- --lecture 2
npm run extract:slides
```

The evaluation commands use the configured provider and can make paid calls when Gemini or DeepSeek is selected. Set `LLM_PROVIDER=fixture` explicitly for deterministic offline live-lecture tests/demos. With no configuration, `loadConfig({})` also defaults to fixture mode; the checked-in template selects fixture mode. There is no fabricated graph fallback.

## Dataset and simulation

The [CS 690S dataset](datasets/cs690s/README.md) covers 23 Fall 2026 lecture entries. Its [manifest](datasets/cs690s/manifest.json) records source URLs, required and optional readings, slide PDFs and text extracts, and TXT or VTT transcripts where available. Some entries lack transcripts or reuse material from another lecture. The frontend uses the manifest to determine whether a lecture can replay. A later ingestion workstream can scrape a course website and emit this same manifest; the checked-in dataset works directly today.

Lecture 02 has an existing curated past replay. Other past replays group recorded transcripts into 8–12 demo topics. Live simulation uses the server's topic stream and resumes an existing run; a new run starts paused with a six-chunk preview at 160 words per chunk and an eight-second interval. **Restart replay** starts over, and **Simulation settings** applies changed options to a new run. Expand a moment for contextual chat, cited chart or animated-diagram requests, and KaTeX equations. Artifacts survive browser reloads within the current in-memory server session, including later topic revisions. See [student-side implementation and checks](src/lecture/README.md). The offline authored demo remains available at `lecture.html?lecture=2&mode=live&transport=fixture`.

The asset preparation script copies the demo PDFs from the dataset on dev/build. Git tracks the dataset and slide preview images. Vite generates `dist/` for hosting.

## Parallel workstreams

Each guide is a self-contained context to hand to a collaborator or coding agent. Pick one, claim a checkbox in a GitHub issue or PR, and note the acceptance criteria and any contract changes.

| Workstream | Starting point |
| --- | --- |
| Reading breakdowns and visual explanations | [Reading agent context](docs/workstreams/readings.md) |
| Course-wide knowledge graph | [Graph agent context](docs/workstreams/course-graph.md) |
| Live lecture, slide retrieval, artifacts and side chat | [Live agent context](docs/workstreams/live-lecture.md) |

There are three workstreams. Linking completed lecture timelines and their artifacts into the course graph is a later milestone of workstream 2, not a separate graph, timeline, or team.

Start with the [code ownership and stack guide](docs/architecture.md), then read the [shared contracts and provider-neutral harness guide](docs/agent-harnesses.md) before defining agent outputs. Use feature branches, keep PRs scoped to a workstream, and run the tests and production build before opening a PR. Update the relevant checklist when its acceptance criteria are met. Coordinate changes to the course shell or shared contracts with the other workstreams.

- [ ] Later: Add a course-site scraper that normalizes materials into the existing dataset manifest, preserves provenance, and marks missing resources.

## Stack and implementation status

[CS50 live lectures](docs/cs50-pilot.md) use the same course library and lecture timeline as other courses. Add CS50 through **Find or add a course**, open Lecture 0, and choose **Start live lecture**. Microphone capture uses local Whisper large-v3-turbo; moment details contain matched slides, notes, highlights, progressive explanations/tables, and equation hover definitions. Setup downloads the speech model into ignored `.local` storage. Audio stays on this laptop; recognized text uses the configured AI provider.

The React + Vite frontend connects to a TypeScript/Fastify backend for transcript replay, topic segmentation, automatic enrichment, contextual chat and validated visual artifacts. Fixture, Gemini, and DeepSeek providers share the same interface. The course graph uses MongoDB persistence, extraction through the selected provider and completion-triggered indexing; lecture materials remain in the dataset folder. Live lecture sessions and artifacts currently use in-memory storage, while durable timeline persistence remains future work. Reading harnesses remain a separate workstream.

The agreed direction is a Node.js + TypeScript/Fastify backend, MongoDB for course data and graph references, and task-specific harnesses behind a shared model-provider interface. Gemini and DeepSeek use the same provider interface. Fixture mode must remain usable without either API or a database. See the architecture guide for module boundaries, suggested libraries, storage design and implementation order.

The older Recall concept brief is reference material, not the current implementation contract. Catch-up, action extraction, annotations and personal review remain possible later features. Tiger Data and Sentient OS are optional ideas, not required dependencies. Deployment is deferred; focus on local development and the three workstreams.

### Classroom demo

Create a demo account with an academic email such as `student@example.edu` and a password of at least eight characters. Choose Student, Instructor, or Teaching assistant on the login or signup page. From **My courses**, open **Find or add a course**, search for `690S` or AI Alignment, and add it to your workspace. You can also create a course from that page.

Students can mark a topic **Unclear** from its expanded timeline view. Instructors and TAs open **Lecture doubts** from their course card. Lectures are listed newest first with total counts. Expand a lecture to see each topic’s count and select a topic to open its details.

AI Alignment and Computer Vision open prepared study notes in the normal lecture timeline. All users enrolled in a course share its prepared notes. When a transcript is unavailable, the page explicitly labels notes from slides/readings as preparation notes. See [shared notes and saved accounts](docs/shared-study-notes.md) for generation and storage details.

The normal API saves accounts, memberships, lecture transcripts/topics/summaries, completed question/answer exchanges, doubts and generated visuals in the configured MongoDB. Personal histories are scoped to the signed-in user. Passwords use salted scrypt hashes; sessions use HttpOnly cookies and hashed database tokens. Email ownership and staff roles remain unverified prototype choices. Custom course definitions and uploaded PDFs still use browser storage. Isolated fixture tests retain the older browser-only demo behavior and simulated counts; database accounts show actual saved doubt counts.
