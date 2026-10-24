import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toParagraphs, tokenize } from '../web/core/text.js';
import { inferHeadings, resolveHeadings, buildSections, sectionAt } from '../web/core/sections.js';

const long = 'Ceci est un paragraphe assez long pour compter comme du vrai texte, avec bien plus de quinze mots dedans.';

test('infers section titles from short title-like lines', () => {
  const paras = toParagraphs(fs.readFileSync('tests/sample-fr.txt', 'utf8'));
  const h = inferHeadings(paras);
  assert.deepEqual(h.map((i) => paras[i]), [
    "La lecture rapide n'est pas une course",
    'Un mot à la fois',
    'Ce que disent les études',
    'Revenir en arrière',
  ]);
});

test('does not take bylines, sentences or short lines before short text as titles', () => {
  const paras = ['Mon titre', 'Par Marie Dupont', long, 'Une phrase courte.', long, 'Encore un titre', 'court'];
  assert.deepEqual(inferHeadings(paras), [0]);
});

test('given headings win over guesses, unless only the title is marked', () => {
  const paras = ['Titre', long, 'Section deux', long];
  assert.deepEqual(resolveHeadings(paras, [0, 2]), [0, 2]);
  assert.deepEqual(resolveHeadings(paras, [0]), [0, 2]);
  assert.deepEqual(resolveHeadings(paras, [9]), [0, 2]);
});

test('sections cover the text and map tokens back to them', () => {
  const paras = ['Intro sans titre.', 'Section A', long, 'Section B', long];
  const tokens = tokenize(paras);
  const sections = buildSections(paras, tokens, [1, 3], 'Début');
  assert.deepEqual(sections.map((s) => s.title), ['Début', 'Section A', 'Section B']);
  assert.equal(sectionAt(sections, 0), 0);
  assert.equal(sectionAt(sections, sections[1].index), 1);
  assert.equal(sectionAt(sections, tokens.length - 1), 2);
});
