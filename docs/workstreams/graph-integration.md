# Live lecture and course graph integration

Own the adapter between live events and the course graph. Coordinate shared IDs and revisions with both workstreams before wiring their UI.

- [ ] Build a linking harness that proposes existing concept IDs, evidence, and new-node candidates for each live moment.
- [ ] Apply revisions idempotently and retain the source link to the exact moment. Avoid duplicates or broken references when a segment is revised.
- [ ] Show attached artifacts on matching graph nodes and allow navigation between the graph, artifact and timeline moment.
- [ ] Evaluate an end-to-end replay with a duplicate event, revised topic, and delayed artifact. Confirm the graph retains one stable node and a working timeline link.
