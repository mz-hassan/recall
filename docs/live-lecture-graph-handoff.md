# Live lecture → knowledge graph handoff

This guide is for the teammate implementing live lecture completion. The knowledge graph already exposes the completion endpoint. The live lecture code must call it once the final transcript and slides have been saved to the lecture datasource.

## Required sequence

1. End transcription and wait for all transcript chunks, slide processing, and corrections to finish.
2. Save the final transcript and slide files. For the current datasource, these files live under `datasets/cs690s/` and are referenced by `datasets/cs690s/manifest.json`.
3. Update the lecture's manifest entry only after every referenced file is readable. Prefer writing temporary files and renaming them into place, then write the manifest last. The graph accepts TXT or VTT transcripts and TXT or text-based PDF slides. Image-only slides need a text extract.
4. Allocate the next positive material revision for this lecture. Start at `1` and increase it whenever the saved transcript, slides, or manifest metadata changes. This is a lecture-material revision; do not use an individual moment's revision.
5. Call `POST /api/graph/lecture-completed` after the datasource write succeeds.

Do not call the graph endpoint for every transcript chunk, when the lecture is merely paused, or before the final files are committed. The endpoint reads the saved datasource; it does not accept transcript or slide content in its request body.

## API request

```http
POST /api/graph/lecture-completed
Content-Type: application/json

{
  "courseId": "ai",
  "lectureId": "3",
  "revision": 1
}
```

The current CS 690S datasource uses `courseId: "ai"`. `lectureId` is the manifest lecture number converted to a string. `revision` must be a positive integer that increases independently for each lecture.

The browser can use the relative path `/api/graph/lecture-completed` through Vite. Node's `fetch` requires an absolute URL, so a backend process should use `http://127.0.0.1:3001/api/graph/lecture-completed` locally and keep the API base URL configurable outside local development.

```js
export async function notifyGraphLectureCompleted(
  { courseId, lectureId, revision },
  baseUrl = 'http://127.0.0.1:3001',
) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/graph/lecture-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId,
      lectureId: String(lectureId),
      revision,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error ?? `Graph completion failed with HTTP ${response.status}`);
  }
  return result.job;
}
```

Call this helper from the backend completion workflow immediately after the durable datasource write completes. Do not make the browser responsible for the only completion notification: closing or refreshing the page could lose it.

## Response and retry behavior

The endpoint schedules asynchronous graph indexing. It does not wait for DeepSeek extraction to finish.

| Response | Meaning | Live lecture action |
| --- | --- | --- |
| `202 { job }` | The update was queued or is running. | Record the acknowledgement; the handoff succeeded. |
| `200 { job }` | This exact revision was already completed. | Treat it as success. |
| `400` | The JSON shape or values are invalid. | Fix the integration; do not retry unchanged. |
| `409` | The revision is stale, or files changed under a previously used revision. | If materials changed, save them fully and send the next revision. Do not blindly increase revisions for a stale duplicate. |
| `422` | The manifest, transcript, or slides cannot be read. | Finish/fix the datasource write, then retry the same revision if its materials have not changed. |
| `503` | MongoDB, the graph worker, or the API is unavailable. | Keep live lecture usable and retry the same event later. |
| Network error or other `5xx` | The acknowledgement is unknown or the service is temporarily unavailable. | Retry the exact same event with the same revision. |

Repeated delivery is safe. The graph coalesces the same `courseId + lectureId + revision` while it is queued or running and returns the existing job after completion. Persist the pending completion event with the lecture record when durable live-lecture storage is added, and clear it only after receiving `200` or `202`.

If a correction or delayed slide arrives after completion, finish saving the new materials and send the next revision. The graph replaces that lecture's old citations while retaining contributions from other lectures.

## Current integration boundary

Live lecture snapshots, recognized text, summaries and artifacts now persist per user/run in the configured MongoDB (see [saved accounts](shared-study-notes.md)). Ending a replay still does not write the graph's final transcript/slides package or call its completion endpoint. A future handoff must resolve ownership and the completed run revision before indexing. Timeline moments and artifacts are not yet graph input; the graph continues reading transcript and slide sources from its configured datasource.

## Local verification

Start MongoDB and the shared API, then use an existing dataset lecture to test the same contract:

```sh
npm run db:start
npm run dev
npm run graph:complete -- 3 1
```

The third command is equivalent to the HTTP request above. It should return a job with `state` equal to `queued`, `running`, or `completed`. The graph page polls job state and displays the published update when indexing completes.

Before handing off the live integration, verify these cases:

- a completed lecture sends one event only after all source files are readable;
- retrying the same event does not create duplicate graph data;
- a transcript correction sends the next revision;
- a graph `503` does not stop or fail the live lecture experience;
- a failed notification remains available for a later retry.
