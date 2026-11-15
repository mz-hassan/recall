# CS50 in Recall

Open `http://localhost:5173` after `npm run dev`. Sign in, use **Find or add a course** to add **CS50: Introduction to Computer Science**, and open its Lecture 0. CS50 uses the same course library, materials pages, lecture timeline, moment details, and chat as the other courses; there is no separate CS50 app or page.

## Setup

Use Node 22.18+ (this machine uses Node 24) and Python 3.11+.

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/install-speech.ps1
node scripts/prepare-cs50.mjs
npm run dev
```

The installer creates `.local/speech-venv` and downloads a pinned CTranslate2 conversion of OpenAI Whisper large-v3-turbo into `.local/speech-model`. Both directories are ignored by Git. It needs no speech API key. The worker runs locally on CPU with int8 weights and six threads. Model downloading needs Internet; recognition runs with `HF_HUB_OFFLINE=1`. It does not use browser cloud speech recognition or a cloud audio API.

Keep the existing server-side DeepSeek settings in `.env` for topic generation, notes, chat and visuals. `LLM_PROVIDER=fixture` provides deterministic test output instead. Audio never goes to that provider; recognized text and relevant public slide/notes text do.

## Two-laptop test

1. On the other laptop, open the linked CS50x 2025 Lecture 0 video and use speakers. The opening contains music/silence; start around **1:15** for speech, or use a section discussing binary representation, algorithms or search to test slide matching.
2. On this laptop, open **CS50 → Lecture 0 → Course material → Start live lecture**, then press **Start listening** in the normal lecture timeline and allow microphone access. The course's **Start a session** button opens the same timeline. Check the level meter. Keep the room quiet and speakers close to the microphone.
3. The first topic appears after one 12-second audio chunk plus local decoding time. Its summary updates cumulatively as speech arrives, without waiting for the topic to close. While a summary refreshes, the previous summary stays visible. The transcript is accessible through a fallback button only if summary generation fails. Chat answers use 1–3 short sentences, capped at 90 words.
4. Scroll or use the timeline to rewind. Open a moment to see its notes and annotated slide viewer in the standard detail panel. **Follow topic** suggests slides; disable it or enter a page number to inspect another slide. Use **Lecture & sources** to return to the course materials, including the video, notes, PDF, and reference transcript.
5. Highlights use actual PDF text rectangles, checked against its SHA-256 fingerprint. Hover a highlight for a short note. **Animate explanation** steps through relevant source text. Tables can fill row by row. Equations expose variable definitions on hover/focus. Moment visuals support chart playback and step diagrams through the existing artifact controls.
6. **Stop listening** stops the microphone, flushes the last partial audio chunk, drains recognized text into topics, and closes the final topic. The timeline and generated artifacts survive reloads while the API process remains alive. A new capture replaces this lecture's timeline; server restarts clear it. **Replay reference transcript** explicitly starts a separate reference replay in the same lecture UI and replaces the current lecture timeline.

Microphone timestamps start at capture time zero, independent of the YouTube playhead. The provided reference transcript is for comparison and is never substituted into a microphone session. Recognition and matching can be wrong. Image-only slides can be browsed, but have no text evidence for automatic highlights; OCR and image understanding are not implemented. Suggested slide matches are not exact synchronization with the video.

Audio lives in browser/worker memory and is not written to disk. Capture accepts requests only from loopback, with a same-origin check and an explicit request header. It processes chunks in order and rejects stale runs. If decoding falls behind, adjacent waiting chunks are combined into a single decode of up to 28 seconds, preserving all samples and timestamps while reducing repeated model work. It no longer stops after five queued chunks. A 90-second waiting-audio ceiling remains for sustained overload; stopping drains the captured audio rather than silently discarding it. Chat, topic processing, and recognition run independently. The normal API saves recognized text, topics, summaries, completed chats, doubts and visual specs per signed-in user in the configured MongoDB. Audio is not archived. See [saved accounts](shared-study-notes.md).

## Validation

`npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` cover the application. The CS50 browser test injects an explicitly labeled ASR fixture and fake browser microphone; it enrolls through the normal course flow and verifies lecture materials, capture, the shared timeline, moment details, source IDs, highlights, progressive tables and reloads on desktop/mobile. It is not a physical microphone accuracy test.

For an opt-in real-model check against a short public CS50 excerpt:

```powershell
.local/speech-venv/Scripts/python.exe scripts/smoke-local-speech.py
```

This fetches a public 19.69-second excerpt (1:15.46–1:35.15), saves that public test audio and a result report under ignored `.local`, and decodes it locally. On this laptop one warm run took **13.5 seconds**, with **2 word errors / 59 reference words (3.39% WER)** after removing the reference speaker label and normalizing punctuation/case. The hypothesis's inserted speaker label still counts as errors. This tiny clean sample does not establish room-microphone accuracy or a general benchmark ranking.

## Sources

Materials are from [CS50x 2025 Week 0](https://cs50.harvard.edu/x/2025/weeks/0/), using its Fall 2024 deck and recording. Original links and SHA-256 hashes are recorded in `datasets/cs50/lecture0/sources.json`. CS50 materials retain their [original license](https://cs50.harvard.edu/x/2025/license/). No ownership is claimed over them.

Model references: [OpenAI large-v3-turbo model card](https://huggingface.co/openai/whisper-large-v3-turbo), [faster-whisper implementation](https://github.com/SYSTRAN/faster-whisper), [CTranslate2 model conversion](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo). The pinned model revision is recorded in `scripts/download-speech.py`.
