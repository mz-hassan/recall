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

Open AI Alignment from the course library. Select a lecture row to replay its timeline when available. Use **Course material** for required readings, optional readings, slides, and **Simulate live**. Each reading links to its own breakdown page. The course-level **Knowledge graph** control is intentionally disabled pending implementation.

## Dataset and simulation

The [CS 690S dataset](datasets/cs690s/README.md) covers 23 Fall 2026 lecture entries. Its [manifest](datasets/cs690s/manifest.json) records source URLs, required and optional readings, slide PDFs and text extracts, and TXT or VTT transcripts where available. Some entries lack transcripts or reuse material from another lecture. The frontend uses the manifest to determine whether a lecture can replay. A later ingestion workstream can scrape a course website and emit this same manifest; the checked-in dataset works directly today.

Lecture 02 has an existing curated replay. Other past timelines with transcripts group the full transcript into 8–12 demo topics for browsing. Live simulation opens paused with the first chunk visible. Press **Play** to advance through a six-chunk preview, one chunk every eight seconds by default. **Simulation settings** lets you adjust the 160-word budget, interval, and chunk limit or select the full transcript. You can also use `lecture.html?lecture=2&mode=live&words=160&interval=8&limit=6`. These are simulation offsets. The DAgger example demonstrates curated enrichment, including multiple slides, an equation, intuition and a topic diagram. Side chat and artifact requests are UI entry points for future harnesses.

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

### Classroom demo

Create a demo account with an academic email such as `student@example.edu` and a password of at least eight characters. Choose Student, Instructor, or Teaching assistant on the login or signup page. From **My courses**, open **Find or add a course**, search for `690S` or AI Alignment, and add it to your workspace. You can also create a course from that page.

Students can mark a topic **Unclear** from its expanded timeline view. Instructors and TAs open **Lecture doubts** from their course card. Lectures are listed newest first with total counts. Expand a lecture to see each topic’s count and select a topic to open its details.

Past timelines use 8–12 stable demo topics per available lecture. Counts include simulated data and student marks from this browser. Account records, course memberships and doubt markers stay in this browser. Passwords are stored as salted verifiers. Email ownership, staff authorization and cross-device syncing require a backend.
