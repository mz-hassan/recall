import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Shared, read-only access to the checked-in course datasets. Features use this instead of
// reading dataset files themselves.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Library course ID → dataset folder. 'ai' matches the course ID the frontend already uses. */
const COURSE_DATASETS: Record<string, string> = { ai: 'datasets/cs690s' };

const Material = z.object({ title: z.string(), source_url: z.string().optional(), files: z.array(z.string()).default([]) });
const ManifestSchema = z.object({
  course: z.string(),
  title: z.string(),
  lectures: z.array(z.object({
    number: z.number().int(),
    date: z.string(),
    title: z.string(),
    folder: z.string(),
    required: z.array(Material).default([]),
    optional: z.array(Material).default([]),
    transcript: z.object({ status: z.string(), files: z.array(z.string()).default([]) }),
    slides: z.object({
      status: z.string(),
      source_url: z.string().optional(),
      files: z.array(z.string()).default([]),
      note: z.string().optional(),
    }),
  })),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestLecture = Manifest['lectures'][number];

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

const manifests = new Map<string, Promise<Manifest>>();

function courseRoot(courseId: string): string {
  const folder = COURSE_DATASETS[courseId];
  if (!folder) throw new DatasetError(`Unknown course: ${courseId}`);
  return path.join(repoRoot, folder);
}

export function loadManifest(courseId: string): Promise<Manifest> {
  let manifest = manifests.get(courseId);
  if (!manifest) {
    manifest = readFile(path.join(courseRoot(courseId), 'manifest.json'), 'utf8')
      .then(text => ManifestSchema.parse(JSON.parse(text)));
    manifest.catch(() => manifests.delete(courseId));
    manifests.set(courseId, manifest);
  }
  return manifest;
}

export async function findLecture(courseId: string, lectureId: string): Promise<ManifestLecture | undefined> {
  if (!COURSE_DATASETS[courseId]) return undefined;
  const manifest = await loadManifest(courseId);
  return manifest.lectures.find(lecture => String(lecture.number) === lectureId);
}

/** Absolute path of a manifest path (relative to the course dataset). Paths outside it are refused. */
export function datasetFilePath(courseId: string, relativePath: string): string {
  const root = courseRoot(courseId);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep)) throw new DatasetError(`Path escapes the dataset: ${relativePath}`);
  return resolved;
}

/** Reads a text file by its manifest path. */
export async function readDatasetFile(courseId: string, relativePath: string): Promise<string> {
  return readFile(datasetFilePath(courseId, relativePath), 'utf8');
}
