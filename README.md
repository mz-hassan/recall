# Recall

Recall helps students recover context during a lecture and revisit it afterward. The course library brings together assigned readings, past timelines and a planned cross-lecture knowledge graph. The live lecture interface groups incoming transcript chunks into moments that can carry summaries, equations, intuition, slides, diagrams and requested artifacts.

## Run locally

Use Node.js 22.18 or later, which runs the server's TypeScript directly.

```sh
npm ci
npm run dev        # web (Vite) + API (Fastify on 127.0.0.1:8787), /api proxied
npm run typecheck  # server/ and shared/
npm test
npm run build
```

`npm run dev:web` and `npm run dev:server` start either half alone. The API defaults to the offline fixture model provider; copy `.env.example` to `.env` to change server settings. Check it with `curl localhost:8787/api/health`.

To use DeepSeek, set `LLM_PROVIDER=deepseek`, `LLM_MODEL=deepseek-flash` and your own `DEEPSEEK_API_KEY` in `.env`. `npm run eval:segmentation -- --lecture 2` replays a lecture through the configured model and prints the topics it finds, with token use and latency.

Open AI Alignment from the course library. Each lecture appears once, with **Reading breakdowns** and **Past timeline** actions. Open the lecture title for sources and **Simulate live**. The course-level **Knowledge graph** control is intentionally disabled pending implementation.

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

Today this is a React + Vite frontend with local dataset replay. Backend services, MongoDB persistence and runtime model harnesses are not implemented yet. Keep the existing UI and animations while building features in their own modules.

The agreed direction is a Node.js + TypeScript/Fastify backend, MongoDB for course data and graph references, and task-specific harnesses behind a shared model-provider interface. Keep DeepSeek as the initial configurable provider; Gemini is the planned replacement. Fixture mode must remain usable without either API or a database. See the architecture guide for module boundaries, suggested libraries, storage design and implementation order.

The older Recall concept brief is reference material, not the current implementation contract. Catch-up, action extraction, annotations and personal review remain possible later features. Tiger Data and Sentient OS are optional ideas, not required dependencies. Deployment is deferred; focus on local development and the three workstreams.
