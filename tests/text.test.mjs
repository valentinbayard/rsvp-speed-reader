import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toParagraphs, tokenize, orpIndex, previousSentence, nextSentence, tokenAt, sentenceStartOf } from '../web/core/text.js';
import { tokenDuration, remainingTimer, clampWpm } from '../web/core/timing.js';
import { Engine } from '../web/core/engine.js';

const words = (s) => tokenize(toParagraphs(s)).map((t) => t.text);

test('paragraphs: blank lines split, single newlines split when there are no blank lines', () => {
  assert.deepEqual(toParagraphs('a b\nc\n\nd'), ['a b c', 'd']);
  assert.deepEqual(toParagraphs('line one\nline two'), ['line one', 'line two']);
  assert.deepEqual(toParagraphs('  \n\n  '), []);
});

test('French typography: lone punctuation sticks to its word', () => {
  assert.deepEqual(words('Il dit : « Bonjour ! » Puis rien ?'), ['Il', 'dit :', '« Bonjour ! »', 'Puis', 'rien ?']);
});

test('long hyphenated compounds are split, short ones and numbers are kept', () => {
  assert.deepEqual(words('anti-constitutionnellement'), ['anti-', 'constitutionnellement']);
  assert.deepEqual(words('Jean-Pierre est arrivé'), ['Jean-Pierre', 'est', 'arrivé']);
  assert.deepEqual(words('de 1990-2000 et -5'), ['de', '1990-2000', 'et', '-5']);
});

test('token offsets point back into the paragraph', () => {
  const paras = toParagraphs('« Bonjour ! » dit-il. Ensuite, il partit.');
  for (const t of tokenize(paras)) {
    assert.equal(paras[t.p].slice(t.start, t.end).replace(/\s+/g, ' '), t.text);
  }
});

test('sentences and pauses', () => {
  const toks = tokenize(toParagraphs('M. Dupont arrive. Il dit, « non. » Fin…\n\nNouveau paragraphe'));
  const by = Object.fromEntries(toks.map((t) => [t.text, t]));
  assert.equal(by['M.'].pause, null, 'abbreviation');
  assert.equal(by['arrive.'].pause, 'sentence');
  assert.equal(by['Il'].sentenceStart, true);
  assert.equal(by['dit,'].pause, 'clause');
  assert.equal(by['«\u202Fnon.\u202F»'].pause, 'sentence');
  assert.equal(by['Fin…'].paragraphEnd, true);
  assert.equal(by['Nouveau'].sentenceStart, true);
});

test('ORP ignores quotes and trailing punctuation', () => {
  assert.equal(orpIndex('a'), 0);
  assert.equal(orpIndex('Rien'), 1);
  assert.equal(orpIndex('«Rien'), 2);
  assert.equal(orpIndex('lecture.'), 2);
  assert.equal(orpIndex('extraordinaire'), 4);
});

test('sentence navigation', () => {
  const toks = tokenize(toParagraphs('Un deux trois. Quatre cinq six sept huit. Neuf dix.'));
  assert.equal(nextSentence(toks, 0), 3);
  assert.equal(previousSentence(toks, 7), 3); // well into a sentence → its start
  assert.equal(previousSentence(toks, 4), 0); // just started → previous one
  assert.equal(sentenceStartOf(toks, 9), 8);
});

test('tokenAt maps a character offset to a token', () => {
  const toks = tokenize(['zéro un deux', 'trois quatre']);
  assert.equal(tokenAt(toks, 0, 6), 1);
  assert.equal(tokenAt(toks, 1, 0), 3);
  assert.equal(tokenAt(toks, 1, 11), 4);
});

test('timing: punctuation and long words take longer; remaining time matches', () => {
  const toks = tokenize(['Le chat, extraordinairement calme. Fin']);
  const d = toks.map((t) => tokenDuration(t, 300, 1));
  assert.ok(d[1] > d[0]);
  assert.ok(d[2] > d[0]);
  assert.ok(d[3] > d[2]);
  const rem = remainingTimer(toks);
  assert.ok(Math.abs(rem(0, 300, 1) - d.reduce((a, b) => a + b)) < 1e-6);
  assert.equal(clampWpm(5000), 1200);
  assert.equal(clampWpm(333), 325);
});

test('engine plays, pauses and smart-resumes at sentence start', () => {
  let now = 0;
  const timers = [];
  const engine = new Engine(tokenize(['Un deux trois. Quatre cinq six sept.']), {
    wpm: 600,
    now: () => now,
    setTimer: (fn, ms) => (timers.push({ fn, at: now + ms }), timers.length),
    clearTimer: (id) => timers[id - 1] && (timers[id - 1].fn = null),
  });
  const seen = [];
  engine.on('word', (i) => seen.push(i));
  const runNext = () => {
    const t = timers.filter((x) => x.fn).sort((a, b) => a.at - b.at)[0];
    now = t.at;
    const fn = t.fn;
    t.fn = null;
    fn();
  };
  engine.play();
  for (let k = 0; k < 5; k++) runNext();
  assert.equal(engine.index, 5);
  engine.pause();
  engine.play();
  assert.equal(engine.index, 3, 'rewinds to "Quatre"');
  engine.pause();
  engine.seek(5);
  engine.play();
  assert.equal(engine.index, 5, 'explicit seek is not rewound');
  while (engine.state === 'playing') runNext();
  assert.equal(engine.state, 'ended');
  assert.ok(engine.readMs > 0);
});
