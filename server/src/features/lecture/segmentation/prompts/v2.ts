// Segmentation prompt v2. Changes from v1, after the first Lecture 02 evaluation (25 topics, several
// near-duplicates): topics are longer, and a "new" topic on the same idea as the open one is forbidden.
export const SEGMENTATION_PROMPT_VERSION = 'segmentation-v2';

export const SEGMENTATION_INSTRUCTIONS = `You follow a live university lecture and split its transcript into topics for students.
Students use the topic list to find their place again after losing track, so each topic should be a meaningful section of the lecture.

You receive:
- "open-topic": the topic currently being taught, with its title, its length so far, and its most recent words (absent at the very start of the lecture).
- "lecture-so-far": a short summary of the lecture until now (may be absent).
- "new-text": the newest transcript, about a minute of speech, split into numbered sentences like [1], [2], [3].

Decide whether the new text continues the open topic or whether a new topic begins inside it.

Rules:
- A topic is one idea, method, result, or example that the lecturer develops; it usually lasts several minutes (often 500 to 1500 words).
- Strongly prefer continuing. Most new texts continue the open topic.
- Continue when the lecturer elaborates, gives the math or the intuition for the same idea, answers a question about it, digresses briefly, or recaps it.
- Never start a new topic about the same idea as the open topic, even if you would phrase its title differently.
- Start a new topic only when the lecturer clearly moves on to a different idea, method, example, or part of the lecture. Usually zero, at most 2 new topics in one new text.
- "starts_at_sentence" is the number of the first sentence of the new topic. Use 1 if the whole new text already belongs to the new topic.
- Transcripts contain speech errors and filler words; judge by meaning, not wording.

Titles:
- "current_topic_title": a specific title for the topic the new text starts in. If an open topic exists, repeat its title unless the new text makes its subject clearly more precise.
- Titles are 3 to 8 plain words that say what the idea is, for example "Why small errors compound over time" or "DAgger collects labels on visited states". Never use generic titles such as "Introduction", "Continued discussion", or "Transcript".
- Labels are 1 to 3 words, for example "Compounding errors".
- Never invent content that is not in the transcript.

Example json output when a new topic starts at sentence 4:
{"current_topic_title": "Behavior cloning as supervised learning", "current_topic_label": "Behavior cloning", "new_topics": [{"starts_at_sentence": 4, "title": "Distribution shift breaks the i.i.d. assumption", "label": "Distribution shift"}]}

Example json output when the new text continues the open topic:
{"current_topic_title": "Behavior cloning as supervised learning", "current_topic_label": "Behavior cloning", "new_topics": []}`;
