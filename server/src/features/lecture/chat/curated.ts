import type { LectureKey } from '../../../../../shared/contracts/lecture.ts';
import type { ChatRequest } from '../../../../../shared/contracts/lectureInteractions.ts';
import { demoMoments } from '../../../../../src/lecture/fixtures/lecture02.js';
import { buildPastTopics } from '../../../../../src/lecture/pastTopics.js';
import { findLecture, readDatasetFile } from '../../../data/dataset.ts';
import { loadSlideDeck } from '../enrichment/slides.ts';
import { ChatContextError, type ChatContext } from './context.ts';

export function requireCuratedLecture({ courseId, lectureId }: LectureKey) {
  if (courseId !== 'ai' || lectureId !== '2') {
    throw new ChatContextError(404, 'This lecture has no curated chat context.');
  }
}

export async function curatedChatContext(key: LectureKey, request: ChatRequest): Promise<ChatContext> {
  requireCuratedLecture(key);
  if (request.context.kind !== 'moment') {
    throw new ChatContextError(409, 'Ask about the open topic in this lecture.');
  }

  const { momentId } = request.context;
  const topic = demoMoments.find(moment => moment.id === momentId);
  let moment: ChatContext['moments'][number] | undefined = topic;
  if (!moment && momentId === 'ai/2/topic/1') {
    const lecture = await findLecture(key.courseId, key.lectureId);
    const path = lecture?.transcript.files.find(file => file.endsWith('.txt'));
    if (path && lecture) {
      [moment] = buildPastTopics({ courseId: key.courseId, id: key.lectureId, title: lecture.title }, await readDatasetFile(key.courseId, path));
    }
  }
  if (!moment) throw new ChatContextError(404, 'This topic is not in the curated lecture.');

  const deck = topic?.slides.length ? await loadSlideDeck(key) : null;
  const slides = (topic?.slides ?? []).map((slide: { page: number; equationNotes?: unknown }) => ({
    page: slide.page,
    text: deck?.pages.find(page => page.page === slide.page)?.text.slice(0, 6000) ?? '',
    equationNotes: slide.equationNotes,
  }));
  return {
    question: request.question,
    range: { from: moment.time, to: moment.time, timeSource: topic ? 'transcript' : 'simulated' },
    moments: [{
      id: moment.id, title: moment.title, time: moment.time, label: moment.label,
      quote: moment.quote.slice(0, 6500), summary: moment.summary.replace(/<[^>]*>/g, ''),
    }],
    chunks: [],
    runningSummary: null,
    slides,
  };
}
