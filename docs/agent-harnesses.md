# Agent harnesses

## Provider boundary (planned)

The prototype makes no runtime model calls. Keep the initial DeepSeek model configurable (the earlier target was **DeepSeek-V4.1-Flash-1017**); Gemini is the planned replacement. Verify the actual model ID against the chosen provider when implementing rather than hard-coding a display name into a harness.

Put the provider interface and adapters in `server/src/llm/`, with `fixture.ts`, `deepseek.ts` and later `gemini.ts`. Feature harnesses depend only on a `generateStructured({ task, instructions, evidence, schema, signal })` operation returning validated data plus provider/model/usage metadata. Do not pass vendor SDK objects into features. Evidence includes source IDs and optional text or page images. An adapter must report unsupported modalities explicitly; a text-only adapter uses retrieved text and cannot claim to have inspected an image.

Use server-only configuration: `LLM_PROVIDER=fixture|deepseek|gemini`, `LLM_MODEL`, optional `DEEPSEEK_BASE_URL`, and the selected provider's `DEEPSEEK_API_KEY` or `GEMINI_API_KEY`. No keys in Vite variables, browser code or Git. Fixture mode is the local default. A provider swap changes configuration and the adapter, not UI code or feature contracts. It still requires rerunning each task's evaluation fixtures because output quality and modality support differ.

Use the official Gemini JavaScript SDK (`@google/genai`) when adding that adapter. Normalize the supported JSON Schema subset at the adapter boundary and validate every returned result against the full application schema. See [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) and the [DeepSeek API reference](https://api-docs.deepseek.com/api/create-chat-completion/). SDK installation and actual calls are future implementation work.

## Task harnesses

Design separate harnesses for each task. A harness owns retrieval, prompt and version, structured output validation, bounded retries for transient failures, and evaluation fixtures. Start with local dataset extracts. Treat the source text as evidence and keep citations to original pages, slide pages or transcript spans. Validate IDs, URLs and graph endpoints before updating the UI. Render generated text as text and render visuals with vetted components. Record fixture and prompt versions, provider model ID, latency and validation failures in evaluation results.

## Shared integration shape

- Use the course ID and manifest lecture number to identify a lecture. Scope moment, reading, node and artifact IDs to their owning lecture or course.
- A timeline moment carries `id`, `time` (seconds), `label`, `title`, `short`, `type`, `summary`, `quote` and `quoteTime`. Add `intuition`, `slides: [{ page, url }]`, `equations: [{ expression, explanation }]`, `artifacts: [{ id, kind, title, url }]`, and optional `graph: { origin, nodes, edges }`. Use empty arrays for missing attachments. See the local fixture in `src/lecture/main.jsx`.
- For production events, propose `moment.upsert` with a stable ID, sequence number and revision. Normalize transcript windows to source references with a path and timestamp or character span. Slide and reading citations include file reference and page where available.
- Topic diagrams accept nodes with `id, label` and edges with `id, from, to, relation`. The course-wide graph should add lecture references first; moment and artifact references are a future graph milestone after completed timelines can be persisted. Keep speculative links distinguishable from source-backed links.
- When a harness returns invalid output or evidence is unavailable, retain the existing result or raw transcript and expose a recoverable status. Never invent page references.

Use the workstream guides for task-specific prompts, tools and evaluation criteria. Runtime agents and model calls are implementation TODOs.

## Completed lecture handoff (future, owned by course graph)

Once timeline persistence exists, define a `lecture.completed` handoff with `courseId`, `lectureId` and `timelineRevision`. The graph job loads that completed revision's moments and artifacts, resolves concepts, then upserts source-backed relationships. Do not stream every in-progress chunk into the course graph. A later correction or artifact can trigger a new indexing revision without duplicating nodes or links. Persist the last indexed revision and job status for retries. The timeline remains the source of truth for moment content; the graph stores references, not a second timeline.
