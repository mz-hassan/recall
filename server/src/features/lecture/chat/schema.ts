import { z } from 'zod';

export const CHAT_TASK = 'lecture.chat';
export const ChatOutput = z.object({
  answer: z.string().trim().min(1).max(6000),
  momentIds: z.array(z.string()).max(12),
  insufficientEvidence: z.boolean(),
});
