import { daggerBundle } from '../../../src/readings/data/dagger.js';
import { papers } from '../../../src/readings/catalog.js';
import type { z } from 'zod';
import type { ReadingBundle } from '../../../shared/contracts/readings.ts';

const generated = new Map<string, z.infer<typeof ReadingBundle>>();
export const findPaper = (paperId: string) => papers.find(p => p.id === paperId);
export function saveReading(paperId: string, bundle: z.infer<typeof ReadingBundle>) { generated.set(paperId, bundle); }

export function loadReading(paperId: string) {
  const paper = papers.find(p => p.id === paperId);
  if (!paper) return null;
  const bundle = paper.prepared ? daggerBundle : generated.get(paperId);
  return bundle ? { paper, bundle } : null;
}
