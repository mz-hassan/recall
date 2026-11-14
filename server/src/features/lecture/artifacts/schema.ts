import { z } from 'zod';
import { ArtifactSpec } from '../../../../../shared/contracts/lectureInteractions.ts';

export const ARTIFACT_TASK = 'lecture.artifact';
export const ArtifactOutput = z.object({
  spec: ArtifactSpec.nullable(),
  momentIds: z.array(z.string()).min(0).max(12),
  insufficientEvidence: z.boolean(), reason: z.string().max(1000),
}).strict();
