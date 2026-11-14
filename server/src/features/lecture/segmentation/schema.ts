import { z } from 'zod';

export const SEGMENTATION_TASK = 'lecture.segmentation';

/** What the segmentation model must return. Developer-owned; validated on every answer. */
export const SegmentationDecision = z.object({
  current_topic_title: z.string().trim().min(1).max(100),
  current_topic_label: z.string().trim().min(1).max(40),
  new_topics: z.array(z.object({
    starts_at_sentence: z.number().int().min(1),
    title: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(40),
  })).max(6),
});
export type SegmentationDecision = z.infer<typeof SegmentationDecision>;
