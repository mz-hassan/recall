# Agent harnesses

Use **DeepSeek-V4.1-Flash-1017**. On DeepSeek's official Chat Completions API, the model is exposed as `deepseek-flash`. A deployment that must pin the exact 1017 checkpoint should use a provider that publishes a versioned ID and record that ID in evaluation results. See the [release announcement](https://api-docs.deepseek.com/news/news261017/) and [Chat Completions reference](https://api-docs.deepseek.com/api/create-chat-completion/).

Keep the model call in the backend. Set `DEEPSEEK_BASE_URL=https://api.deepseek.com`, `DEEPSEEK_MODEL=deepseek-flash`, and `DEEPSEEK_API_KEY` in the server environment. The official request is `POST /chat/completions`, with Bearer authentication and a body containing `model` and `messages`. Keep keys outside Vite variables, browser code and Git. The current frontend requires no credentials.

Design separate harnesses for each task. A harness owns retrieval, prompt and version, structured output validation, bounded retries for transient failures, and evaluation fixtures. Start with local dataset extracts. Treat the source text as evidence and keep citations to original pages, slide pages or transcript spans. Validate IDs, URLs and graph endpoints before updating the UI. Render generated text as text and render visuals with vetted components. Record fixture and prompt versions, provider model ID, latency and validation failures in evaluation results.

## Shared integration shape

- Use the course ID and manifest lecture number to identify a lecture. Scope moment, reading, node and artifact IDs to their owning lecture or course.
- A timeline moment carries `id`, `time` (seconds), `label`, `title`, `short`, `type`, `summary`, `quote` and `quoteTime`. Add `intuition`, `slides: [{ page, url }]`, `equations: [{ expression, explanation }]`, `artifacts: [{ id, kind, title, url }]`, and optional `graph: { origin, nodes, edges }`. Use empty arrays for missing attachments. See the local fixture in `src/lecture/main.jsx`.
- For production events, propose `moment.upsert` with a stable ID, sequence number and revision. Normalize transcript windows to source references with a path and timestamp or character span. Slide and reading citations include file reference and page where available.
- Topic diagrams accept nodes with `id, label` and edges with `id, from, to, relation`. The course-wide graph should add lecture, moment, and artifact references. Keep speculative links distinguishable from source-backed links.
- When a harness returns invalid output or evidence is unavailable, retain the existing result or raw transcript and expose a recoverable status. Never invent page references.

Use the workstream guides for task-specific prompts, tools and evaluation criteria. Runtime agents and model calls are implementation TODOs.
