# CS50 live microphone pilot

Open `http://localhost:5173/cs50.html` after `npm run dev`. The library home also links to **CS50 live microphone pilot**. No course enrollment is required for this public test.

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
2. On this laptop, open the pilot, press **Start listening**, and allow microphone access. Check the level meter. Keep the room quiet and the speakers close enough to the microphone.
3. Expect the first transcript after one 12-second chunk plus local decoding time. Topic and annotation generation can take longer. Transcript is kept even if note generation fails.
4. **Follow latest** follows topics; select an earlier topic to rewind. **Follow topic** suggests slides. Disable it or enter a page number to inspect another slide.
5. Highlights use actual PDF text rectangles, checked against its SHA-256 fingerprint. Hover a highlight for a short note. **Animate explanation** steps through relevant source text. Tables can fill row by row. Equations expose variable definitions on hover/focus. Moment visuals support chart playback and step diagrams through the existing artifact controls.
6. **Stop listening** stops the microphone, flushes the last partial audio chunk, drains recognized text into topics, and closes the final topic. The timeline and generated artifacts survive reloads while the API process remains alive. A new capture replaces this lecture's timeline; server restarts clear it.

Microphone timestamps start at capture time zero, independent of the YouTube playhead. The provided reference transcript is for comparison and is never substituted into a microphone session. Recognition and matching can be wrong. Image-only slides can be browsed, but have no text evidence for automatic highlights; the pilot does not claim OCR or image understanding. Suggested slide matches are not exact synchronization with the video.

Audio lives in browser/worker memory and is not written to disk. Capture accepts requests only from loopback, with a same-origin check and an explicit request header. It processes chunks in order, rejects stale runs, and stops visibly if it cannot keep up; it does not silently discard chunks. The application uses in-memory session storage, not a durable recording archive.

## Validation

`npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` cover the existing application and pilot. The CS50 browser test injects an explicitly labeled ASR fixture and fake browser microphone; it verifies capture, the shared timeline, source IDs, highlights, progressive tables and reloads on desktop/mobile. It is not a physical microphone accuracy test.

For an opt-in real-model check against a short public CS50 excerpt:

```powershell
.local/speech-venv/Scripts/python.exe scripts/smoke-local-speech.py
```

This fetches a public 19.69-second excerpt (1:15.46–1:35.15), saves that public test audio and a result report under ignored `.local`, and decodes it locally. On this laptop one warm run took **13.5 seconds**, with **2 word errors / 59 reference words (3.39% WER)** after removing the reference speaker label and normalizing punctuation/case. The hypothesis's inserted speaker label still counts as errors. This tiny clean sample does not establish room-microphone accuracy or a general benchmark ranking.

## Sources

Materials are from [CS50x 2025 Week 0](https://cs50.harvard.edu/x/2025/weeks/0/), using its Fall 2024 deck and recording. Original links and SHA-256 hashes are recorded in `datasets/cs50/lecture0/sources.json`. CS50 materials retain their [original license](https://cs50.harvard.edu/x/2025/license/). No ownership is claimed over them.

Model references: [OpenAI large-v3-turbo model card](https://huggingface.co/openai/whisper-large-v3-turbo), [faster-whisper implementation](https://github.com/SYSTRAN/faster-whisper), [CTranslate2 model conversion](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo). The pinned model revision is recorded in `scripts/download-speech.py`.
