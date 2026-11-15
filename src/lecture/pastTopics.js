import { demoMoments } from './fixtures/lecture02.js';
import { loadTranscript } from './dataset.js';

// Vary the count per lecture while keeping topic IDs stable for saved doubts.
function topicCount(lectureId) {
  return 8 + ((Number(lectureId) * 7 + 2) % 5);
}

const labels = {
  2: ['Lecture setup and expert policies'],
  3: ['Learning by interaction', 'Agent and environment', 'Rewards and return', 'State and actions', 'Policies', 'Value functions', 'Policy evaluation', 'Learning from experience'],
  4: ['Reward hacking', 'Proxy objectives', 'Specification failures', 'Unexpected strategies', 'Reward design', 'Evaluating behavior', 'Robust objectives', 'Open questions'],
  5: ['Inverse reinforcement learning', 'Expert demonstrations', 'Reward inference', 'Feature expectations', 'Reward ambiguity', 'Policy comparison', 'Optimization', 'Applications'],
  6: ['Maximum entropy IRL', 'Trajectory probabilities', 'Entropy', 'Feature matching', 'Partition function', 'Likelihood', 'Optimization', 'Model limitations'],
  7: ['Bayesian reward inference', 'Expert behavior', 'Reward priors', 'Likelihood of demonstrations', 'Posterior rewards', 'Sampling', 'Uncertainty', 'Policy evaluation'],
  8: ['State visitation', 'Occupancy measures', 'Expert trajectories', 'Matching distributions', 'Imitation objective', 'Discriminators', 'Policy optimization', 'Coverage'],
  9: ['Interactive learning', 'Human feedback', 'Policy updates', 'Feedback timing', 'Credit assignment', 'Exploration', 'Modeling the teacher', 'Evaluation'],
  10: ['Learning from human feedback', 'Preference data', 'Comparing responses', 'Reward model training', 'Policy optimization', 'Regularization', 'Evaluation', 'Reward overoptimization'],
  11: ['Human preferences', 'Ranking outcomes', 'Pairwise comparisons', 'Choice models', 'Preference uncertainty', 'Learning from judgments', 'Model assumptions', 'Generalization'],
  12: ['Direct preference methods', 'Paired responses', 'Implicit rewards', 'Reference policy', 'Optimization objective', 'Training stability', 'Evaluation', 'Limitations'],
  13: ['Performance guarantees', 'Preference model assumptions', 'Data coverage', 'Reward uncertainty', 'Policy regret', 'Sample complexity', 'Distribution shift', 'Limits of guarantees'],
};

// Labels are demo chapter titles. Transcript excerpts retain their original order.
export function buildPastTopics(lecture, transcript) {
  const courseId = lecture.courseId ?? 'ai';
  const curated = courseId === 'ai' && lecture.id === '2';
  const words = transcript.match(/\S+/g) ?? [];
  if (!words.length) return [];
  const count = Math.min(words.length, curated ? 1 : topicCount(lecture.id));
  const topics = Array.from({ length: count }, (_, index) => {
    const time = index * 8;
    const start = Math.floor(index * words.length / count);
    const end = curated ? Math.ceil(words.length * demoMoments[0].time / 3660) : Math.floor((index + 1) * words.length / count);
    const quote = words.slice(start, end).join(' ');
    const title = (courseId === 'ai' ? labels[lecture.id]?.[index] : undefined) ?? lecture.title + ' · Part ' + (index + 1);
    return {
      id: courseId + '/' + lecture.id + '/topic/' + (index + 1), time, title, short: title,
      label: [Math.floor(time / 60), time % 60].map(value => String(value).padStart(2, '0')).join(':'),
      type: 'TRANSCRIPT', summary: '', quote, quoteTime: 'Simulation time',
      slides: [], equations: [], artifacts: [], intuition: '', graph: null,
    };
  });
  return curated
    ? [...topics, ...demoMoments]
    : topics;
}

export async function loadPastTopics(lecture,{prepared=false}={}) {
  if(prepared){
    const response=await fetch('/api/prepared/lectures/'+encodeURIComponent(lecture.courseId??'ai')+'/'+encodeURIComponent(lecture.id)+'/moments');
    if(!response.ok)throw new Error('Prepared notes are unavailable.');
    return (await response.json()).moments;
  }
  return buildPastTopics(lecture, await loadTranscript(lecture));
}
