import type { LectureKey } from '../../../../../shared/contracts/lecture.ts';
import { ChatAnswer, type ChatRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import { ProviderError, type ModelProvider } from '../../../llm/types.ts';
import type { LectureStore } from '../store/types.ts';
import { ChatContextError, retrieveChatContext } from './context.ts';
import { CHAT_INSTRUCTIONS } from './prompts/v1.ts';
import { CHAT_TASK, ChatOutput } from './schema.ts';
import { concise } from '../concise.ts';

export async function answerLectureQuestion({ key, request, store, provider, signal }: {
  key: LectureKey; request: ChatRequest; store: LectureStore; provider: ModelProvider; signal?: AbortSignal;
}): Promise<ChatAnswer> {
  const context = retrieveChatContext(store, key, request);
  const result = await provider.generateStructured({
    task: CHAT_TASK, instructions: CHAT_INSTRUCTIONS, schema: ChatOutput,
    evidence: [{ id: 'lecture-context', kind: 'text', text: JSON.stringify(context) }],
    options: { reasoning: 'off', temperature: 0.2, maxOutputTokens: 600 },
    ...(signal && { signal }),
  });
  if (store.getSession(key)?.runId !== request.runId) throw new ChatContextError(409, 'The lecture restarted while answering. Ask again using the current timeline.');
  const output = ChatOutput.parse(result.data);
  const ids = [...new Set(output.momentIds)];
  if (ids.some(id => !context.moments.some(moment => moment.id === id)) || (!output.insufficientEvidence && !ids.length)) {
    throw new ProviderError('invalid_output', 'Chat returned unsupported moment citations.');
  }
  return ChatAnswer.parse({
    runId: request.runId, answer: concise(output.answer, 90), insufficientEvidence: output.insufficientEvidence,
    citations: output.insufficientEvidence ? [] : ids.map(id => {
      const moment = context.moments.find(value => value.id === id)!;
      return { momentId: moment.id, title: moment.title, label: moment.label, time: moment.time };
    }),
    range: context.range, provider: result.provider, model: result.model,
  });
}
