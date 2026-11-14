# Recall — lecture companion prototype

Buildless HTML/CSS/JS. Serve `dist` with any static web server, e.g. `python3 -m http.server 4173 --directory dist`.

## What works
- Simulated lecture clock, pause/play, 1×/5×/15× speed, scrubbing, and progressively revealed concept moments.
- Scrollable timeline, contextual connections, slide browser, simple explanations and source excerpts.
- Time-aware catch-up dialog, interactive concept map, saved moments, and study checklist persisted in browser localStorage.
- Responsive layout, keyboard controls, native accessible dialogs and reduced-motion handling.

## Source & scope
Content is curated from the user's CS 690S Lecture 02 (2026-09-15), **Limitations of Behavior Cloning**, Prof. Scott Niekum.
Local sources: `690S/AI_Alignment_Mac_Transfer/lectures/02_2026-09-15_limitations-of-behavior-cloning/slides/limitbc-slides.pdf` and `transcripts/2026-09-15-transcript.txt` (relative to the parent ChatGPT directory).
Slide images are unmodified rasterizations of the original PDF. Summaries are prototype editorial content, not model output. Times with ≈ are estimated within untimed transcript passages. Source excerpts retain transcript wording with light punctuation normalization.

No microphone, audio playback, transcription service, AI backend, or calendar connection is implemented. Other lectures are clearly labeled library previews. No deadline is invented; checklist items are study suggestions derived from closing remarks. External Google Fonts are optional; local fallback fonts remain usable offline.
