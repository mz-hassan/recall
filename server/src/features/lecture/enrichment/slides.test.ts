import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findCandidateSlides, loadSlideDeck, notedPageRange, parseSlidePages } from './slides.ts';

test('splits extracts marked with "--- PDF page N ---" or "PAGE N" headers', () => {
  assert.deepEqual(parseSlidePages('--- PDF page 1 ---\nTitle slide\n--- PDF page 2 ---\nDAgger loop\n'),
    [{ page: 1, text: 'Title slide' }, { page: 2, text: 'DAgger loop' }]);
  assert.deepEqual(parseSlidePages('PAGE 1\nIntro\nPAGE 2\nRewards').map(page => page.page), [1, 2]);
});

test('splits Beamer extracts on their "N/M" footers and drops LaTeX residue', () => {
  const source = 'Setup\nGoal: learn π\nDeck 1/3\nBehavior cloning\n<latexit sha1="x">junk</latexit>\nDeck 2/3\nDAgger\nDeck 3/3\n';
  assert.deepEqual(parseSlidePages(source), [
    { page: 1, text: 'Setup Goal: learn π' }, { page: 2, text: 'Behavior cloning' }, { page: 3, text: 'DAgger' },
  ]);
});

test('an extract without page marks yields no pages rather than guessed numbers', () => {
  assert.deepEqual(parseSlidePages('Slide one text\n\nSlide two text\n'), []);
});

test('candidate search ranks pages that share rare topic words', () => {
  const pages = [
    { page: 1, text: 'Course overview and logistics' },
    { page: 2, text: 'Behavior cloning supervised learning policy' },
    { page: 3, text: 'DAgger aggregates expert labels on learner states policy' },
  ];
  const found = findCandidateSlides(pages, 'so DAgger queries the expert and aggregates the labels into the dataset', 2);
  assert.equal(found[0]!.page, 3);
  assert.deepEqual(findCandidateSlides([], 'anything'), []);
});

test('a borrowed deck is limited to the page range in its manifest note', async () => {
  assert.deepEqual(notedPageRange('The lecture 10 slide deck covers this topic on pages 26–47.'), [26, 47]);
  assert.equal(notedPageRange(undefined), null);
  const eleven = await loadSlideDeck({ courseId: 'ai', lectureId: '11' });
  assert.ok(eleven.pages.length > 0);
  assert.ok(eleven.pages.every(page => page.page >= 26 && page.page <= 47));
});

test('decks that had no page marks now load page by page from the PDF extraction', async () => {
  for (const lectureId of ['0', '1', '4', '5', '9', '10']) {
    const deck = await loadSlideDeck({ courseId: 'ai', lectureId });
    assert.ok(deck.pages.length > 10, `lecture ${lectureId} has ${deck.pages.length} pages`);
    assert.equal(deck.pages[0]!.page, 1);
  }
});

test('Lecture 02 links pre-rendered images; other decks link the PDF page', async () => {
  const two = await loadSlideDeck({ courseId: 'ai', lectureId: '2' });
  assert.equal(two.pages.length, 13);
  assert.deepEqual(two.slide(9), { page: 9, url: 'assets/slide-09.png', kind: 'image' });
  const three = await loadSlideDeck({ courseId: 'ai', lectureId: '3' });
  assert.equal(three.pages.length, 21);
  assert.match(three.slide(4).url, /^api\/datasets\/ai\/lectures\/03_.*\.pdf#page=4$/);
  assert.equal(three.slide(4).kind, 'pdf');
});
