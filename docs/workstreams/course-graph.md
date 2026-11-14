# Course-wide knowledge graph

Workstream 2. Own `src/graph/` and the planned `server/src/features/graph/`. Start from `src/graph/CourseGraphButton.jsx`; add `CourseGraphPage.jsx`, graph components and graph API hooks here. Backend extraction, alias resolution and graph queries belong in separate files in the graph feature folder. See [module boundaries and stack](../architecture.md). The entry point lives on the main course page. Build an Obsidian-like graph across lecture topics.

- [x] Build a graph harness that extracts concepts and typed relationships from multiple lectures with citations and resolves aliases and duplicate concepts.
- [x] Store stable concept IDs and source references. Filter by lecture and relation, surface neighboring concepts, and link nodes to the lecture or moment.
- [x] Implement an interactive graph with pan, zoom, search, visible relation labels on selection, and a keyboard-accessible list of connections.
- [x] Evaluate a fixture across behavior cloning and reinforcement learning for deduplication, resolvable edges and source links.

Implemented setup and the teammate handoff are documented in [Knowledge graph](../knowledge-graph.md). The live owner saves dataset files/manifest, then sends `POST /api/graph/lecture-completed` with course ID, lecture ID, and a positive integer material revision. Only generated graph data, citations, and indexing metadata are stored in MongoDB; source materials remain in the folder behind a replaceable adapter. No Docker is required. Real model quality evaluation still requires a configured DeepSeek key.

## Future milestone: link completed timelines and artifacts

This belongs to this same course graph workstream, after workstream 3 can save completed timelines. Keep graph access on the main course page. A moment's small explanatory diagram is a timeline artifact, not another course graph.

- [ ] Agree on stable moment/artifact IDs and a completed timeline revision with the live lecture owner.
- [ ] Implement `server/src/features/graph/indexCompletedLecture.ts` to load a completed lecture, resolve existing concepts, and attach references to its moments, slides and generated artifacts.
- [ ] Index on lecture completion, not on every live chunk. Handle a later correction or delayed artifact by reindexing the affected completed revision idempotently.
- [ ] Show linked artifacts on a graph node and navigate to the original past timeline moment. Do not copy the timeline into graph storage.
- [ ] Evaluate repeated completion, a revised completed lecture, shared concepts across two lectures, and a delayed artifact. Expect one stable concept and working source links.

Done for the initial graph: a course-level view navigates source-backed concepts across at least two lectures. Artifact linking can remain unchecked until persisted timelines exist.
