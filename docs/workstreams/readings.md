# Reading breakdowns

Workstream 1. Own `src/readings/` and the planned `server/src/features/readings/`. Start with Lecture 02's required DAgger paper in the manifest. Enter the page from any lecture row.

- [ ] Build a reading harness that retrieves text and page images and returns an outline, key claims, notation, equations, study questions, and page citations.
- [ ] Render expandable sections and accessible visuals, such as an algorithm flow or experiment chart, with the original paper one click away.
- [ ] Support multiple assigned papers and distinguish required from optional materials. Handle missing PDF text or diagrams by linking to the original.
- [ ] Evaluate a DAgger fixture for faithful claims, cited figures and equations, and a graceful failure when retrieval is incomplete.

## Where code goes

- Extend `src/readings/ReadingPage.jsx`; add `components/` for sections, citations and visuals, and `api.js` for this feature's calls. Keep reading logic out of `src/library/main.jsx`.
- In `server/src/features/readings/`, separate `routes.ts`, `service.ts`, `harness.ts`, prompts and fixtures. Use the shared dataset loader, storage repositories and model adapter; do not duplicate those in this feature.
- Put reading input/output schemas in `shared/contracts/readings.ts` when shared contracts are introduced. Keep evaluations in this feature's `__tests__/` with small fixtures, referencing dataset PDFs instead of copying them.
- Use React for the page, KaTeX for notation and vetted SVG/chart components for visual specs. Return structured sections, not executable model-generated UI.

Done: the lecture's Reading breakdowns action displays a cited breakdown fixture, then the same contract from the backend, with original-source navigation and a missing-source fallback. See [stack and ownership](../architecture.md).
