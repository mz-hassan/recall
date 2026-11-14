// Live check of the paper teacher through the configured provider. Run with:
//   node --env-file-if-exists=.env scripts/check-teacher.ts [--decisions | --diagram]
// Uses LLM_PROVIDER / LLM_MODEL / DEEPSEEK_API_KEY like the server; incurs provider usage unless LLM_PROVIDER=fixture.
import { loadConfig } from '../server/src/config.ts';
import { createProvider } from '../server/src/llm/index.ts';
import { registerReadingsFixtures } from '../server/src/features/readings/index.ts';
import { explainPaper } from '../server/src/features/readings/service.ts';

const config = loadConfig();
const provider = createProvider(config.llm);
registerReadingsFixtures(provider);
console.log(`Provider: ${provider.name} (${provider.model})`);

if (process.argv.includes('--decisions')) {
  for (const question of ['What is a policy? Answer in one sentence, text only.', 'How do rollout, expert feedback, and retraining connect across DAgger iterations? Help me see how the loop works.']) {
    const result = await explainPaper('ai-dagger', { requestId: 'decision-check', question, context: null, history: [] }, AbortSignal.timeout(60000), provider);
    console.log(JSON.stringify({ question, blocks: result?.blocks, diagrams: result?.diagrams.map(d => d.title), annotations: result?.annotations.length }, null, 2));
    if (!result || (question.includes('text only') ? result.diagrams.length !== 0 : result.diagrams.length === 0)) process.exitCode = 1;
  }
} else {
  const question = process.argv.includes('--diagram') ? 'Draw a small diagram of the DAgger loop and add an annotation explaining aggregation. Then briefly explain the diagram.' : 'In two sentences, why does DAgger aggregate data?';
  const result = await explainPaper('ai-dagger', { requestId: 'smoke-test', question, context: { page: 4, passageId: 'aggregation' }, history: [] }, AbortSignal.timeout(60000), provider);
  console.log(JSON.stringify(result, null, 2));
}
