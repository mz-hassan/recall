# Recall

Recall helps students recover context during a lecture and revisit it afterward. The course library brings together assigned readings, past timelines and a cross-lecture knowledge graph. The live lecture interface groups incoming transcript chunks into moments that can carry summaries, equations, intuition, slides, diagrams and requested artifacts.

## Run locally

Use Node.js 22.18 or later (Node 24 recommended). The TypeScript runner supports both backend features.

```sh
npm ci
cp .env.example .env
```

Set `DEEPSEEK_API_KEY` in `.env`. Both the graph and live lecture features use this same configuration. Start MongoDB for graph storage in a separate terminal (no Docker):

```sh
npm run db:start
```

Then start the app:

```sh
npm run dev        # Vite + one shared Fastify API, default 127.0.0.1:3001
npm run typecheck
npm test          # graph and live lecture tests, including nested test directories
npm run build
```

Open AI Alignment from the course library. Each lecture appears once, with **Reading breakdowns** and **Past timeline** actions. Open the lecture title for sources and **Simulate live**. **Knowledge graph** opens the database-backed course graph. See the [graph setup, demonstration commands, and live lecture completion contract](docs/knowledge-graph.md). No Docker is used. `npm run dev:web` runs the frontend alone; `npm run dev:server` runs the shared API. The graph needs MongoDB, but live lecture still runs if the graph database is unavailable. Start MongoDB and restart the API to enable the graph again.

The shared API also exposes transcript replay/streaming, model-backed topic segmentation, topic enrichment, page-exact slides and running lecture summaries. Check it at `http://localhost:3001/api/health`. To run the backend pipelines directly:

```sh
npm run eval:segmentation -- --lecture 2
npm run eval:lecture -- --lecture 2
npm run extract:slides
```

The evaluation commands use the configured provider and can make paid calls when DeepSeek is selected. Set `LLM_PROVIDER=fixture` explicitly for deterministic offline live-lecture tests/demos. With no configuration, `loadConfig({})` also defaults to fixture mode; the checked-in template selects DeepSeek. There is no fabricated graph fallback.

## Dataset and simulation

The [CS 690S dataset](datasets/cs690s/README.md) covers 23 Fall 2026 lecture entries. Its [manifest](datasets/cs690s/manifest.json) records source URLs, required and optional readings, slide PDFs and text extracts, and TXT or VTT transcripts where available. Some entries lack transcripts or reuse material from another lecture. The frontend uses the manifest to determine whether a lecture can replay. A later ingestion workstream can scrape a course website and emit this same manifest; the checked-in dataset works directly today.

Lecture 02 has an existing curated replay. Other past timelines with transcripts display all their chunks for browsing. Live simulation opens paused with the first chunk visible. Press **Play** to advance through a six-chunk preview, one chunk every eight seconds by default. **Simulation settings** lets you adjust the 160-word budget, interval, and chunk limit or select the full transcript. You can also use `lecture.html?lecture=2&mode=live&words=160&interval=8&limit=6`. These are simulation offsets. The DAgger example demonstrates curated enrichment, including multiple slides, an equation, intuition and a topic diagram. Side chat and artifact requests are UI entry points for future harnesses.

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

The React + Vite frontend provides local dataset replay. The course graph now has a TypeScript/Fastify backend, MongoDB graph persistence, a DeepSeek extraction harness, and completion-triggered indexing. Lecture materials stay in the dataset folder. The live lecture backend provides transcript streaming, segmentation and enrichment with in-memory sessions; recording, durable timeline persistence and the frontend handoff remain separate work. Reading harnesses remain a separate workstream.

The agreed direction is a Node.js + TypeScript/Fastify backend, MongoDB for course data and graph references, and task-specific harnesses behind a shared model-provider interface. Keep DeepSeek as the initial configurable provider; Gemini is the planned replacement. Fixture mode must remain usable without either API or a database. See the architecture guide for module boundaries, suggested libraries, storage design and implementation order.

The older Recall concept brief is reference material, not the current implementation contract. Catch-up, action extraction, annotations and personal review remain possible later features. Tiger Data and Sentient OS are optional ideas, not required dependencies. Deployment is deferred; focus on local development and the three workstreams.
