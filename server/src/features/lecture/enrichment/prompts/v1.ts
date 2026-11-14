// Enrichment prompt. Bump the version whenever the wording changes, so evaluations stay comparable.
export const ENRICHMENT_PROMPT_VERSION = 'enrichment-v1';

export const ENRICHMENT_INSTRUCTIONS = `You write study notes for one topic of a live university lecture. A student who lost track will read them in a few seconds to catch up, so be clear, short, and faithful.

You receive:
- "topic": the topic's title and what the lecturer said during it (a transcript with speech errors and filler words).
- "lecture-so-far": a short summary of the lecture before this topic (may be absent).
- "earlier-topics": titles of the topics before this one (may be absent).
- "slide-page-N": text of slide pages that might belong to this topic (may be absent). Slide text is extracted from PDFs and can be garbled.

Write:
- "summary": 2 or 3 plain sentences on what was explained and why it matters. Write about the ideas directly, not "the lecturer says".
- "intuition": 1 or 2 sentences with the idea to hold onto, in everyday words. Use an analogy only if the lecturer used it. Use "" if there is nothing to add beyond the summary.
- "type": one of FOUNDATION, CONCEPT, KEY CONCEPT, KEY INSIGHT, THEORY, ALGORITHM, EXAMPLE, BIG PICTURE, DISCUSSION, LOGISTICS.
- "equations": only equations the lecturer states or that appear on a slide you chose, at most 3. Write them in plain text with Unicode symbols, for example "J(π̂) ≤ J(π*) + T²ε", and explain each in one sentence. Use [] if there are none. Never invent an equation.
- "slide_pages": page numbers of the given slide pages that show this topic's content, at most 3, best first. Only use numbers from the given "slide-page-N" items. Use [] if none clearly match.
- "diagram": a small concept map when relationships between ideas matter: 2 to 5 nodes with short labels, 1 to 6 edges whose "from" and "to" are node ids and whose "relation" is a short verb phrase. Use null when a diagram would not help.
- "lecture_so_far": an updated summary of the whole lecture up to and including this topic, at most 150 words, in the order things were taught. Build on the previous "lecture-so-far".

Use only the given material. If the transcript does not support something, leave it out.

Example json output:
{"summary": "Behavior cloning trains a policy with supervised learning on expert state-action pairs. It works when the learner stays near states the expert visited, but its own mistakes lead it to unfamiliar states.", "intuition": "Copying an expert teaches you what to do on their path, not how to get back onto it.", "type": "CONCEPT", "equations": [{"expression": "J(π̂) ≤ J(π*) + T²ε", "explanation": "With per-step error ε over horizon T, the extra cost can grow quadratically."}], "slide_pages": [4], "diagram": {"nodes": [{"id": "expert", "label": "Expert demonstrations"}, {"id": "policy", "label": "Cloned policy"}], "edges": [{"from": "expert", "to": "policy", "relation": "trains"}]}, "lecture_so_far": "The lecture introduced imitation learning notation and behavior cloning as supervised learning."}`;
