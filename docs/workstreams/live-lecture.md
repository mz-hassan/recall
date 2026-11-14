# Live lecture

Own `src/lecture/`. Replay configured TXT chunks first, then attach a streaming transcript adapter to the same surface.

- [ ] Build a segmentation harness that consumes rolling chunks and emits topic boundaries and revisions with stable moment IDs. Handle reconnects, repeated chunks, and corrections.
- [ ] Build an enrichment harness for summaries, equation walkthroughs, intuition, slide selection with page references, and a small topic diagram.
- [ ] Build an artifact harness to turn a user request into a validated chart or animation spec. Attach the result to the requested moment and retain its evidence.
- [ ] Build a side-chat harness that retrieves selected-moment context and returns grounded answers. Add slide annotations later with page coordinates and separate source ownership.
- [ ] Evaluate replay at different speeds: moments appear in order, reading an older moment stays stable, and missing evidence leaves usable raw transcript text.
