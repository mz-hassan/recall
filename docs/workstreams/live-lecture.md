# Live lecture

Workstream 3. Own `src/lecture/` and the planned `server/src/features/lecture/`. Replay configured TXT chunks first, then attach a streaming transcript adapter to the same surface.

- [ ] Build a segmentation harness that consumes rolling chunks and emits topic boundaries and revisions with stable moment IDs. Handle reconnects, repeated chunks, and corrections.
- [x] Build an enrichment harness for summaries, equation walkthroughs, intuition, slide selection with page references, and a small topic diagram.
- [ ] Build an artifact harness to turn a user request into a validated chart or animation spec. Attach the result to the requested moment and retain its evidence.
- [ ] Build a side-chat harness that retrieves selected-moment context and returns grounded answers. Add slide annotations later with page coordinates and separate source ownership.
- [ ] Evaluate replay at different speeds: moments appear in order, reading an older moment stays stable, and missing evidence leaves usable raw transcript text.

## Where code goes

- Keep `src/lecture/main.jsx` as page composition. Extract new behavior into `components/`, `hooks/` and `api.js` rather than growing that file. Preserve the existing timeline motion and paused six-chunk simulation default.
- Existing `replay.js` owns deterministic chunking and `dataset.js` locates sources. `MomentExtras.jsx` contains artifact/equation display and the chat stub. Evolve these or extract focused components; do not create a second timeline.
- In `server/src/features/lecture/`, separate segmentation, enrichment, artifacts and chat harness files, each with prompts and evaluation fixtures. Add transcript adapters under `transcription/` and persistence orchestration in `service.ts`.
- Put timeline/event/artifact schemas in `shared/contracts/lecture.ts` when introduced. Use HTTP for commands and server-sent events for incoming moments; simulated and later audio transcript adapters feed the same event contract.
- Use KaTeX for equations and validated SVG/chart specs for artifacts. A local explanatory topic diagram belongs to a moment. The cross-lecture knowledge graph belongs to workstream 2 on the course page.

- [ ] Persist completed timeline revisions and artifact IDs; expose a completion handoff for the graph owner. Graph indexing after completion is a future TODO under workstream 2, not a fourth workstream.

Done: configurable replay emits validated, ordered moments; attachments and contextual chat use feature contracts; reconnects do not duplicate moments. See [stack and ownership](../architecture.md).
