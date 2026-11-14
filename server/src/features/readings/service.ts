import { loadReading } from '../../data/readings.ts';
import type { ModelProvider } from '../../llm/index.ts';
import { teach } from './harness.ts';
import type { TeacherInput } from '../../../../shared/contracts/readings.ts';

export async function explainPaper(paperId: string, request: TeacherInput, signal: AbortSignal, provider: ModelProvider) {
  const reading = loadReading(paperId);
  if (!reading) return null;
  return teach(request, reading.bundle, provider, signal);
}
