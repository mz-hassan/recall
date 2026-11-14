import { copyFile, mkdir } from 'node:fs/promises';

const root = new URL('../datasets/cs690s/lectures/', import.meta.url);
const output = new URL('../public/pdfs/', import.meta.url);
const files = {
  'ai-01-slides.pdf': '01_2026-09-10_behavior-cloning/slides/bc-slides.pdf',
  'ai-01-reading.pdf': '01_2026-09-10_behavior-cloning/required/bco.pdf',
  'ai-02-slides.pdf': '02_2026-09-15_limitations-of-behavior-cloning/slides/limitbc-slides.pdf',
  'ai-02-reading.pdf': '02_2026-09-15_limitations-of-behavior-cloning/required/dagger.pdf',
  'ai-03-slides.pdf': '03_2026-09-17_reinforcement-learning/slides/rl-slides.pdf',
  'ai-03-ppo.pdf': '03_2026-09-17_reinforcement-learning/optional/ppo.pdf',
};
await mkdir(output, { recursive: true });
await Promise.all(Object.entries(files).map(([name, source]) =>
  copyFile(new URL(source, root), new URL(name, output))));
