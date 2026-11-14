# Recall

Recall helps students recover context during a lecture and revisit it afterward. The course library brings together assigned readings, past timelines and a planned cross-lecture knowledge graph. The live lecture interface groups incoming transcript chunks into moments that can carry summaries, equations, intuition, slides, diagrams and requested artifacts.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
npm test
npm run build
```

Open AI Alignment from the course library. Each lecture appears once, with **Reading breakdowns** and **Past timeline** actions. Open the lecture title for sources and **Simulate live**. The course-level **Knowledge graph** control is intentionally disabled pending implementation.

## Dataset and simulation

The [CS 690S dataset](datasets/cs690s/README.md) covers 23 Fall 2026 lecture entries. Its [manifest](datasets/cs690s/manifest.json) records source URLs, required and optional readings, slide PDFs and text extracts, and TXT or VTT transcripts where available. Some entries lack transcripts or reuse material from another lecture. The frontend uses the manifest to determine whether a lecture can replay. A later ingestion workstream can scrape a course website and emit this same manifest; the checked-in dataset works directly today.

Lecture 02 has an existing curated replay. Other past timelines with transcripts display all their chunks for browsing. Live simulation starts with one chunk and adds another on each interval. **Simulation settings** lets you change the word budget and interval. The defaults are 160 words and 5 seconds. You can also use `lecture.html?lecture=2&mode=live&words=160&interval=5`. These are simulation offsets. The DAgger example demonstrates curated enrichment, including multiple slides, an equation, intuition and a topic diagram. Side chat and artifact requests are UI entry points for future harnesses.

The asset preparation script copies the demo PDFs from the dataset on dev/build. Git tracks the dataset and slide preview images. Vite generates `dist/` for hosting.

## Parallel workstreams

Each guide is a self-contained context to hand to a collaborator or coding agent. Pick one, claim a checkbox in a GitHub issue or PR, and note the acceptance criteria and any contract changes.

| Workstream | Starting point |
| --- | --- |
| Reading breakdowns and visual explanations | [Reading agent context](docs/workstreams/readings.md) |
| Course-wide knowledge graph | [Graph agent context](docs/workstreams/course-graph.md) |
| Live lecture, slide retrieval, artifacts and side chat | [Live agent context](docs/workstreams/live-lecture.md) |
| Connect live topics and artifacts to the course graph | [Integration agent context](docs/workstreams/graph-integration.md) |

Read the [shared contracts and DeepSeek API guide](docs/agent-harnesses.md) before defining agent outputs. Use feature branches, keep PRs scoped to a workstream, and run the tests and production build before opening a PR. Update the relevant checklist when its acceptance criteria are met. Coordinate changes to the course shell or shared contracts with the other workstreams.

- [ ] Later: Add a course-site scraper that normalizes materials into the existing dataset manifest, preserves provenance, and marks missing resources.
