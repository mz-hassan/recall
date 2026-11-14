# Recall — Stay in the thought

Immersive lecture companion prototype. Buildless HTML/CSS/JS; serve `dist` with a static server.

## Version 2
- Dark full-screen vertical timeline, initially focused on the current concept.
- Wheel, touch and arrow-key navigation; eased motion, curved horizontal offsets, depth, scale and fading.
- Click the focused concept to move the timeline left and expand its explanation and real lecture slide. Escape closes.
- Separate corner concept map; source excerpts and saved moments live inside expanded details.
- Animated SVG concept illustrations, simulated session clock, keyboard focus states, mobile layout and reduced-motion support.

The original interface is preserved at `/Users/mzhassan/Documents/ChatGPT/Recall/backups/v1-classic/dist` and in the first published Site version / commit 6a9a5b4d303cce316d9e2681de6e5a651662d7f4.

## Source and limitations
CS 690S Lecture 02, September 15, 2026: Limitations of Behavior Cloning, Prof. Scott Niekum. Slide PNGs are rendered from the user's original local PDF. Content is curated from its companion transcript. Approximate timestamps are marked ≈. Animated diagrams are illustrative, not original slides.

No microphone, transcription, audio playback or AI backend. Playback advances a simulated clock. Concept map can jump ahead. Saved moments use localStorage. Google Fonts are optional; system fallbacks work without network access.

## Local preview
`python3 -m http.server 4173 --bind 127.0.0.1 --directory dist`
