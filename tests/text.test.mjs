import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toParagraphs, tokenize, orpIndex, previousSentence, nextSentence, tokenAt, sentenceStartOf } from '../web/core/text.js';
import { tokenDuration, tokenBeats, wordScale, remainingTimer, clampWpm } from '../web/core/timing.js';
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

test('words of more than 13 letters are split in even pieces, at their hyphens if they have some', () => {
  const fr = (s) => tokenize(toParagraphs(s), { lang: 'fr' }).map((t) => t.text);
  assert.deepEqual(fr('anticonstitutionnellement et particulièrement'), ['anticonstitu-', 'tionnellement', 'et', 'particu-', 'lièrement']);
  assert.deepEqual(fr('Saint-Germain-des-Prés, anti-constitutionnellement.'), ['Saint-Germain-', 'des-Prés,', 'anti-constitu-', 'tionnellement.']);
  assert.deepEqual(fr('Jean-Pierre est arrivé'), ['Jean-Pierre', 'est', 'arrivé']);
  assert.deepEqual(fr('de 1990-2000 et -5, https://exemple.fr/developpement'), ['de', '1990-2000', 'et', '-5,', 'https://exemple.fr/developpement']);
  assert.deepEqual(tokenize(['internationalization'], { lang: 'en' }).map((t) => t.text), ['internation-', 'alization']);
  assert.deepEqual(tokenize(['Donaudampfschifffahrtsgesellschaft'], { lang: null }).map((t) => t.text), ['Donaudampf-', 'schifffahrts-', 'gesellschaft']);
  for (const t of tokenize(toParagraphs('Les approvisionnements gouvernementaux sont considérablement réorganisés.'))) {
    assert.ok(t.text.replace(/[^\p{L}]/gu, '').length <= 13, t.text);
  }
});

test('a number and its unit are one word', () => {
  assert.deepEqual(words('à 12 km, 3 h et 20 °C. Le m est'), ['à', '12\u202Fkm,', '3\u202Fh', 'et', '20\u202F°C.', 'Le', 'm', 'est']);
});

test('numbers grouped with spaces stay whole; currency sticks to its number', () => {
  assert.deepEqual(words('3 000 personnes, 1\u202F500\u00A0000 € en 2020 300 jours'), ['3\u202F000', 'personnes,', '1\u202F500\u202F000\u202F€', 'en', '2020', '300', 'jours']);
});

test('token offsets point back into the paragraph', () => {
  const paras = toParagraphs('« Bonjour ! » dit-il. Ensuite, particulièrement, il partit.');
  for (const t of tokenize(paras)) {
    assert.equal(paras[t.p].slice(t.start, t.end).replace(/\s+/g, '\u202F'), t.text.replace(/(?<=\p{L})-$/u, ''));
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

test('French punctuation: asides, dialogue, abbreviations', () => {
  const pauses = (s) => tokenize(toParagraphs(s)).map((t) => `${t.text}${t.pause ? `/${t.pause}` : ''}${t.sentenceStart ? '^' : ''}`);
  assert.deepEqual(pauses('Il est — dit-on — parti (hier) ici.'), ['Il^', 'est/clause', '—\u202Fdit-on/clause', '—\u202Fparti/clause', '(hier)/clause', 'ici./sentence']);
  assert.deepEqual(pauses('« Viens ! » dit-il. Je… je sais.'), ['«\u202FViens\u202F!\u202F»/clause^', 'dit-il./sentence', 'Je…/clause^', 'je', 'sais./sentence']);
  assert.deepEqual(pauses('En 52 av. J.-C. pour Rome, etc. Fin [...] du texte.'), ['En^', '52', 'av.', 'J.-C.', 'pour', 'Rome,/clause', 'etc./sentence', 'Fin^', '[...]/clause', 'du', 'texte./sentence']);
  assert.deepEqual(pauses('Né en 52 av. J.-C. Puis rien.'), ['Né^', 'en', '52', 'av.', 'J.-C./sentence', 'Puis^', 'rien./sentence']);
});

test('ORP ignores quotes and trailing punctuation', () => {
  assert.equal(orpIndex('a'), 0);
  assert.equal(orpIndex('Rien'), 1);
  assert.equal(orpIndex('«Rien'), 2);
  assert.equal(orpIndex('lecture.'), 2);
  assert.equal(orpIndex('extraordinaire'), 4);
});

test('ORP never lands on an apostrophe or a hyphen', () => {
  for (const w of ["C'est", "d'un", "n'est", 'l’œil', "qu'il", "l'université", 'J.-C.', 'peut-être']) {
    const t = tokenize([w])[0];
    assert.match(Array.from(t.text.slice(t.orp))[0], /\p{L}/u, w);
  }
  assert.equal(orpIndex("C'est"), 2); // C'[e]st, like "Cest"
  assert.equal(orpIndex("l'université"), 4); // l'un[i]versité: 4th of 11 letters
});

test('accents are composed, so the focus letter keeps its accent', () => {
  const t = tokenize(toParagraphs('e\u0301te\u0301'))[0];
  assert.equal(t.text, 'été');
  assert.equal(Array.from(t.text.slice(t.orp))[0], 't');
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

test('timing follows the patent: word lengths, sentence pauses, average word = 60000 / wpm', () => {
  const beats = (s) => tokenize([s]).map((t) => tokenBeats(t));
  const [short, seven, eight] = beats('chat lecture lectures');
  assert.equal(short.word, 1);
  assert.equal(seven.word, 1);
  assert.equal(eight.word, 1.3);
  assert.equal(beats('Un deux trois. Quatre cinq six sept huit. Fin')[2].pause, 1, 'short sentence');
  assert.equal(beats('Un deux trois. Quatre cinq six sept huit neuf dix onze. Fin')[10].pause, 2.2, '8 words');
  assert.equal(beats(`${'mot '.repeat(23)}fin. Après`)[23].pause, 3.3, '24 words');
  assert.equal(beats('Le chat, dit-il')[1].pause, 0.6, 'comma');
  assert.equal(beats('Fin.')[0].pause, 2.2, 'paragraph end');

  const toks = tokenize(['Le chat, extraordinairement calme. Fin de la phrase ici']);
  const scale = wordScale(toks);
  const avgWord = toks.reduce((a, t) => a + tokenBeats(t).word, 0) * scale / toks.length;
  assert.ok(Math.abs(avgWord - 1) < 1e-9);
  const d = toks.map((t) => tokenDuration(t, 300, 1, scale));
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
