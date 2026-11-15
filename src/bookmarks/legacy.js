import { readStored } from '../storage.js';

// Older bookmarks were browser-wide. Only copy them to an account on explicit request.
export function browserBookmarks() {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === 'recall-saved') {
        for (const index of readStored(key)) {
          if (!Number.isInteger(index) || index < -1 || index > 6) continue;
          found.push({ courseId: 'ai', lectureId: '2', runId: null,
            momentId: index === -1 ? 'ai/2/topic/1' : 'ai/2/curated/' + index });
        }
      }
      const past = key.match(/^recall-saved-(ai|cv|cs50)-(\d+)-topics$/);
      if (past) {
        const [, courseId, lectureId] = past;
        for (const index of readStored(key)) {
          if (!Number.isInteger(index) || index < 0) continue;
          found.push({ courseId, lectureId, runId: null, momentId: courseId + '/' + lectureId + '/topic/' + (index + 1) });
        }
      }
      const live = key.match(/^recall-saved-live-(ai|cv|cs50)-(\d+)-(.+)$/);
      if (live) {
        const [, courseId, lectureId, runId] = live;
        for (const momentId of readStored(key)) {
          if (typeof momentId === 'string') found.push({ courseId, lectureId, runId, momentId });
        }
      }
    }
  } catch { /* Browser storage can be disabled. */ }
  return found;
}
