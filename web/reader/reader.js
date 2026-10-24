import { Engine } from '../core/engine.js';
import { tokenize, previousSentence, nextSentence, paragraphStart } from '../core/text.js';
import { remainingTimer, WPM_STEP } from '../core/timing.js';
import { t } from '../core/i18n.js';

const BASE = new URL('..', import.meta.url).href;

const ICONS = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3v4.5h4.5"/><path d="M10.5 9.5v5l3.5-2.5z" fill="currentColor"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3v4.5h-4.5"/><path d="M10 9.5v5l3.5-2.5z" fill="currentColor"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
};

// Fonts and styles are added through APIs that page Content-Security-Policies
// do not block, so the reader also works when injected by the extension.
let fontsAdded = false;
export function addFonts() {
  if (fontsAdded || typeof FontFace === 'undefined') return;
  fontsAdded = true;
  const faces = [
    ['literata-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    ['literata-latin-ext.woff2', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0,U+2C60-2C7F,U+A720-A7FF'],
  ];
  for (const [file, unicodeRange] of faces) {
    const face = new FontFace('Literata RSVP', `url(${BASE}fonts/${file})`, { weight: '200 900', unicodeRange, display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => {});
  }
}

let sheetPromise = null;
function loadStyles() {
  sheetPromise ??= fetch(new URL('./reader.css', import.meta.url))
    .then((r) => r.text())
    .then((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
  return sheetPromise;
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/**
 * Mounts a full-screen reader.
 *
 * @param {HTMLElement} host  element to attach the (shadow) reader to
 * @param {Object} opts
 * @param {{title?: string, paragraphs: string[], headings?: number[]}} opts.doc
 * @param {Object} opts.settings          see core/storage.js DEFAULT_SETTINGS
 * @param {number} [opts.position]        token index to start at
 * @param {boolean} [opts.resumed]        opened at a remembered position: start paused
 * @param {(s: Object) => void} [opts.onSettings]
 * @param {(index: number, total: number) => void} [opts.onPosition]
 * @param {(state: string) => void} [opts.onState]
 * @param {() => void} [opts.onClose]
 */
export function createReader(host, opts) {
  addFonts();
  const doc = opts.doc;
  const settings = { ...opts.settings };
  const tokens = tokenize(doc.paragraphs);
  if (!tokens.length) throw new Error('empty text');
  const remaining = remainingTimer(tokens);
  const engine = new Engine(tokens, {
    wpm: settings.wpm,
    punctuation: settings.punctuation,
    smartResume: settings.smartResume,
  });

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '';
  const styles = loadStyles().then((sheet) => {
    shadow.adoptedStyleSheets = [sheet];
    root.style.visibility = '';
  });

  const root = el('div', 'root');
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', doc.title || 'RSVP');
  root.style.visibility = 'hidden'; // until the stylesheet is in
  root.innerHTML = `
    <div class="context" part="context"><div class="article"><div class="cursor"></div></div></div>
    <div class="stage">
      <div class="band"><div class="word" aria-live="off"></div></div>
      <div class="lead-in"></div>
      <div class="speed"></div>
      <div class="flash"></div>
      <div class="hint"></div>
      <div class="thin-progress"><div></div></div>
    </div>
    <button class="chip top">${ICONS.up}<span>${t('backToPosition')}</span></button>
    <button class="chip bottom">${ICONS.up}<span>${t('backToPosition')}</span></button>
    <div class="toast"></div>
    <div class="topbar">
      <button class="icon-btn" data-act="close" aria-label="${t('close')}">${ICONS.close}</button>
      <div class="title"></div>
      <button class="icon-btn text" data-act="settings" aria-label="${t('settings')}">Aa</button>
    </div>
    <div class="controls"><div class="controls-inner">
      <div class="scrub">
        <span class="pct"></span>
        <input type="range" min="0" step="1" aria-label="Position">
        <span class="left"></span>
      </div>
      <div class="buttons">
        <div class="speed-ctl left">
          <button data-act="slower" aria-label="${t('slower')}">−</button>
          <span class="val"></span>
          <button data-act="faster" aria-label="${t('faster')}">+</button>
        </div>
        <button class="round" data-act="prev" aria-label="${t('prevSentence')}">${ICONS.back}</button>
        <button class="play" data-act="play" aria-label="${t('resume')}">${ICONS.play}</button>
        <button class="round" data-act="next" aria-label="${t('nextSentence')}">${ICONS.fwd}</button>
        <span></span>
      </div>
    </div></div>
    <div class="recap"><div class="card">
      <h2>${t('done').replace(/^(.)(.)/, '$1<span class="orp">$2</span>')}</h2>
      <div class="rule"></div>
      <div class="stats"></div>
      <div class="actions">
        <button class="btn" data-act="again">${t('readAgain')}</button>
        <button class="btn primary" data-act="close">${t('close')}</button>
      </div>
    </div></div>
    <div class="scrim" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-label="${t('settings')}"></div>`;
  shadow.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const stage = $('.stage');
  const wordEl = $('.word');
  const speedEl = $('.speed');
  const hintEl = $('.hint');
  const flashEl = $('.flash');
  const leadEl = $('.lead-in');
  const thinBar = $('.thin-progress > div');
  const context = $('.context');
  const article = $('.article');
  const cursorEl = $('.cursor');
  const chipTop = $('.chip.top');
  const chipBottom = $('.chip.bottom');
  const toastEl = $('.toast');
  const scrub = $('input[type=range]');
  const pctEl = $('.scrub .pct');
  const leftEl = $('.scrub .left');
  const speedVal = $('.speed-ctl .val');
  const sheet = $('.sheet');
  $('.topbar .title').textContent = doc.title || '';
  scrub.max = String(tokens.length - 1);

  // ---------- Article (context view) ----------

  const headings = new Set(doc.headings ?? []);
  const paraEls = doc.paragraphs.map((text, i) => {
    const p = el(headings.has(i) ? 'h2' : 'p');
    p.dataset.p = String(i);
    p.textContent = text;
    article.appendChild(p);
    return p;
  });

  const rangeOf = (i) => {
    const tok = tokens[i];
    const node = paraEls[tok.p].firstChild;
    const r = document.createRange();
    r.setStart(node, tok.start);
    r.setEnd(node, tok.end);
    return r;
  };

  let readParas = 0; // paragraphs [0, readParas) are greyed
  function markRead(i) {
    const p = tokens[i].p;
    if (p !== readParas) {
      const [a, b] = p > readParas ? [readParas, p] : [p, readParas];
      for (let k = a; k < b; k++) paraEls[k].classList.toggle('read', k < p);
      readParas = p;
    }
    if (globalThis.CSS?.highlights && globalThis.Highlight) {
      const r = document.createRange();
      r.setStart(paraEls[tokens[i].p].firstChild, 0);
      r.setEnd(paraEls[tokens[i].p].firstChild, tokens[i].start);
      CSS.highlights.set('rsvp-read', new Highlight(r));
    }
  }

  function placeCursor() {
    const rects = rangeOf(engine.index).getClientRects();
    if (!rects.length) return;
    const r = rects[0];
    const base = article.getBoundingClientRect();
    Object.assign(cursorEl.style, {
      left: `${r.left - base.left - 4}px`,
      top: `${r.top - base.top - 1}px`,
      width: `${r.width + 8}px`,
      height: `${r.height + 2}px`,
    });
    markRead(engine.index);
  }

  /** Scrolls so the current word sits on the reading line (where the RSVP word was). */
  function scrollToCursor(behavior = 'auto') {
    const r = rangeOf(engine.index).getBoundingClientRect();
    const lineY = bandY();
    const target = context.scrollTop + (r.top + r.height / 2) - lineY;
    context.scrollTo({ top: target, behavior });
  }

  function bandY() {
    const b = $('.band').getBoundingClientRect();
    const c = context.getBoundingClientRect();
    return b.top + b.height / 2 - c.top;
  }

  function updateChips() {
    if (state !== 'paused') return;
    const r = rangeOf(engine.index).getBoundingClientRect();
    const c = context.getBoundingClientRect();
    const controlsTop = $('.controls').getBoundingClientRect().top;
    chipTop.classList.toggle('show', r.bottom < c.top + 60);
    chipBottom.classList.toggle('show', r.top > controlsTop);
  }

  /** Token under a point: the nearest word of the paragraph that was tapped. */
  function tokenFromPoint(x, y, target) {
    const p = target.closest?.('[data-p]');
    if (!p) return -1;
    const pi = Number(p.dataset.p);
    let best = -1;
    let bestD = Infinity;
    for (let i = paragraphStart(tokens, pi); i < tokens.length && tokens[i].p === pi; i++) {
      for (const r of rangeOf(i).getClientRects()) {
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = dy * 4 + dx; // prefer the right line
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD === 0) break;
    }
    return best;
  }

  // ---------- RSVP word ----------

  function renderWord(i, dim = false) {
    const tok = tokens[i];
    const text = tok.text;
    const cp = Array.from(text.slice(tok.orp))[0] ?? '';
    wordEl.replaceChildren(
      document.createTextNode(text.slice(0, tok.orp)),
      Object.assign(el('span', 'orp'), { textContent: cp }),
      document.createTextNode(text.slice(tok.orp + cp.length)),
    );
    wordEl.classList.toggle('dim', dim);
    // Centre the focus letter on the anchor tick; shrink words that do not fit.
    wordEl.style.transform = 'none';
    const orpSpan = wordEl.children[0];
    const total = wordEl.offsetWidth;
    const before = orpSpan.offsetLeft;
    const centre = before + orpSpan.offsetWidth / 2;
    const band = stage.clientWidth;
    const anchorX = band * (parseFloat(getComputedStyle(root).getPropertyValue('--anchor')) / 100 || 0.4);
    const s = Math.min(1, (anchorX - 14) / Math.max(1, centre), (band - anchorX - 14) / Math.max(1, total - centre));
    wordEl.style.transform = `translate(${-centre * s}px, -50%) scale(${s})`;
  }

  function renderSpeed() {
    speedEl.textContent = `${engine.wpm} ${t('wpm')}`;
    speedVal.innerHTML = `${engine.wpm}<small>${t('wpm')}</small>`;
  }

  function renderProgress() {
    const i = engine.index;
    const frac = tokens.length > 1 ? i / (tokens.length - 1) : 1;
    thinBar.style.transform = `scaleX(${frac})`;
    if (state === 'paused') {
      scrub.value = String(i);
      scrub.style.setProperty('--fill', `${frac * 100}%`);
      pctEl.textContent = `${Math.round(frac * 100)} %`;
      const min = Math.round(remaining(i, engine.wpm, engine.punctuation) / 60000);
      leftEl.textContent = t('minLeft', min);
    }
  }

  // ---------- State ----------

  let state = 'ready';
  let leadTimer = null;
  let positionTimer = null;
  let maxIndex = engine.index;

  function setState(s) {
    state = s;
    root.dataset.state = s;
    opts.onState?.(s);
  }

  engine.on('word', (i) => {
    maxIndex = Math.max(maxIndex, i);
    if (state === 'playing' || state === 'ready') renderWord(i);
    else if (state === 'paused') {
      placeCursor();
    }
    renderProgress();
    if (i % 25 === 0) savePosition();
  });

  engine.on('state', (s) => {
    if (s === 'playing') {
      clearTimeout(leadTimer);
      leadEl.classList.remove('run');
      setState('playing');
      toastEl.classList.remove('show');
      if (!hintEl.classList.contains('gone')) setTimeout(() => hintEl.classList.add('gone'), 3500);
      requestWakeLock();
    } else if (s === 'paused') {
      enterPaused();
      savePosition();
      releaseWakeLock();
    } else if (s === 'ended') {
      showRecap();
      savePosition(tokens.length - 1);
      releaseWakeLock();
    }
  });

  engine.on('wpm', () => {
    renderSpeed();
    renderProgress();
    settings.wpm = engine.wpm;
    opts.onSettings?.({ ...settings });
  });

  let pausedHintShown = false;
  function enterPaused() {
    setState('paused');
    if (!pausedHintShown) {
      pausedHintShown = true;
      setTimeout(() => state === 'paused' && toast(t('pausedHint'), 3500), 250);
    }
    renderProgress();
    // Layout must be up to date before measuring.
    requestAnimationFrame(() => {
      placeCursor();
      scrollToCursor();
      updateChips();
    });
  }

  function savePosition(pos = engine.index) {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => opts.onPosition?.(pos, tokens.length), 50);
  }

  function play() {
    if (sheetOpen) return;
    if (state === 'ended') {
      engine.seek(0);
    }
    renderWord(engine.index);
    engine.play();
  }

  function pause() {
    clearTimeout(leadTimer);
    leadEl.classList.remove('run');
    if (engine.isPlaying) engine.pause();
    else if (state === 'ready') enterPaused();
  }

  function jump(index, how) {
    engine.seek(index);
    if (state === 'paused') scrollToCursor('smooth');
    if (how && state === 'playing') flash(how);
  }

  let flashTimer = null;
  function flash(text) {
    flashEl.textContent = text;
    flashEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('show'), 700);
  }

  let toastTimer = null;
  function toast(text, ms = 2200) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function changeSpeed(delta) {
    engine.setWpm(engine.wpm + delta);
    speedEl.classList.add('bump');
    setTimeout(() => speedEl.classList.remove('bump'), 160);
  }

  function showRecap() {
    setState('ended');
    const words = maxIndex + 1;
    const minutes = engine.readMs / 60000;
    const time =
      minutes < 1
        ? `${Math.max(1, Math.round(engine.readMs / 1000))} s`
        : `${Math.floor(minutes)}:${String(Math.round((minutes % 1) * 60)).padStart(2, '0')}`;
    const avg = minutes > 0 ? Math.round(words / minutes) : engine.wpm;
    $('.stats').innerHTML = `
      <div><b>${words.toLocaleString()}</b><span>${t('wordsRead')}</span></div>
      <div><b>${time}</b><span>${t('timeSpent')}</span></div>
      <div><b>${avg}</b><span>${t('avgSpeed')}</span></div>`;
  }

  // ---------- Wake lock (web) ----------

  let wakeLock = null;
  async function requestWakeLock() {
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {}
  }
  function releaseWakeLock() {
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  }

  // ---------- Gestures on the stage (while playing) ----------

  let gesture = null;
  stage.addEventListener('pointerdown', (e) => {
    gesture = { x: e.clientX, y: e.clientY, t: performance.now(), speedSteps: 0, done: false };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.done) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    // Vertical drag: speed. 36px per step, up = faster.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) {
      const steps = Math.trunc(-dy / 36);
      if (steps !== gesture.speedSteps) {
        changeSpeed((steps - gesture.speedSteps) * WPM_STEP);
        gesture.speedSteps = steps;
      }
      gesture.vertical = true;
    }
  });
  stage.addEventListener('pointerup', (e) => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.vertical) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Swipe left = forward (like turning a page), right = back.
      if (dx < 0) jump(nextSentence(tokens, engine.index), '⟳');
      else jump(previousSentence(tokens, engine.index), '⟲');
      if (state === 'ready') renderWord(engine.index);
      return;
    }
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
      if (state === 'ready') {
        clearTimeout(leadTimer);
        leadEl.classList.remove('run');
        play();
      } else if (state === 'playing') pause();
    }
  });
  stage.addEventListener('pointercancel', () => (gesture = null));

  // ---------- Context view interactions ----------

  let lastTap = { i: -1, t: 0 };
  article.addEventListener('click', (e) => {
    if (state !== 'paused') return;
    if (!window.getSelection()?.isCollapsed) return; // the user is selecting text
    const i = tokenFromPoint(e.clientX, e.clientY, e.target);
    if (i < 0) return;
    if (i === engine.index && performance.now() - lastTap.t < 4000 && lastTap.i === i) {
      play();
      return;
    }
    engine.seek(i);
    lastTap = { i, t: performance.now() };
    hintEl.textContent = '';
  });

  let scrollRaf = 0;
  context.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(updateChips);
    },
    { passive: true },
  );
  chipTop.addEventListener('click', () => scrollToCursor('smooth'));
  chipBottom.addEventListener('click', () => scrollToCursor('smooth'));

  scrub.addEventListener('input', () => {
    engine.seek(Number(scrub.value));
    scrollToCursor();
    updateChips();
  });

  const actions = {
    close: () => opts.onClose?.(),
    settings: openSheet,
    'sheet-close': closeSheet,
    play,
    prev: () => jump(previousSentence(tokens, engine.index)),
    next: () => jump(nextSentence(tokens, engine.index)),
    slower: () => changeSpeed(-WPM_STEP),
    faster: () => changeSpeed(WPM_STEP),
    again: () => {
      engine.seek(0);
      maxIndex = 0;
      engine.readMs = 0;
      setState('ready');
      renderWord(0);
      play();
    },
  };
  root.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-act]');
    if (btn && actions[btn.dataset.act]) {
      e.stopPropagation();
      actions[btn.dataset.act]();
    }
  });

  // ---------- Keyboard ----------

  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    if (sheetOpen) {
      if (k === 'Escape') closeSheet();
      else handled = false;
    } else if (k === ' ' || k === 'Spacebar' || k === 'k') {
      if (e.target?.tagName === 'BUTTON' && k !== 'k') {
        handled = false;
      } else if (state === 'playing') pause();
      else play();
    } else if (k === 'Enter' && state !== 'playing' && e.target?.tagName !== 'BUTTON') play();
    else if (k === 'ArrowLeft') {
      jump(e.shiftKey ? engine.index - 1 : previousSentence(tokens, engine.index), e.shiftKey ? '‹' : '⟲');
      if (state === 'ready') renderWord(engine.index);
    } else if (k === 'ArrowRight') {
      jump(e.shiftKey ? engine.index + 1 : nextSentence(tokens, engine.index), e.shiftKey ? '›' : '⟳');
      if (state === 'ready') renderWord(engine.index);
    } else if (k === 'ArrowUp' && state !== 'paused') changeSpeed(WPM_STEP);
    else if (k === 'ArrowDown' && state !== 'paused') changeSpeed(-WPM_STEP);
    else if (k === '+' || k === '=') changeSpeed(WPM_STEP);
    else if (k === '-') changeSpeed(-WPM_STEP);
    else if (k === 'Escape') {
      if (state === 'playing' || state === 'ready') pause();
      else opts.onClose?.();
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  window.addEventListener('keydown', onKey, true);

  function onVisibility() {
    if (document.hidden) pause();
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onResize() {
    if (state === 'playing' || state === 'ready') renderWord(engine.index);
    if (state === 'paused') {
      placeCursor();
      scrollToCursor();
    }
  }
  window.addEventListener('resize', onResize);

  // ---------- Settings sheet ----------

  let sheetOpen = false;
  function openSheet() {
    if (engine.isPlaying) engine.pause();
    sheetOpen = true;
    renderSheet();
    root.classList.add('sheet-open');
  }
  function closeSheet() {
    sheetOpen = false;
    root.classList.remove('sheet-open');
  }

  function seg(key, options) {
    return `<div class="seg" data-key="${key}">${options
      .map(([v, label]) => `<button data-v="${v}" aria-pressed="${String(settings[key]) === String(v)}">${label}</button>`)
      .join('')}</div>`;
  }
  function toggle(key, label, help) {
    return `<div class="row switch"><div><label id="l-${key}">${label}</label><div class="help">${help}</div></div>
      <button class="toggle" role="switch" data-key="${key}" aria-labelledby="l-${key}" aria-checked="${!!settings[key]}"></button></div>`;
  }
  function renderSheet() {
    sheet.innerHTML = `
      <div class="grab"></div>
      <h3>${t('settings')}</h3>
      <div class="row"><span class="label">${t('sSpeed')}</span>
        <div class="speed-row"><input type="range" data-key="wpm" min="100" max="1200" step="${WPM_STEP}" value="${engine.wpm}" style="--fill:${((engine.wpm - 100) / 1100) * 100}%"><output>${engine.wpm} ${t('wpm')}</output></div></div>
      <div class="row"><span class="label">${t('sTextSize')}</span>${seg('fontSize', [[0.85, 'A−'], [1, 'A'], [1.2, 'A+'], [1.45, 'A++']])}</div>
      <div class="row"><span class="label">${t('sTheme')}</span>${seg('theme', [['light', t('sThemeLight')], ['dark', t('sThemeDark')], ['auto', t('sThemeAuto')]])}</div>
      <div class="row"><span class="label">${t('sPunct')}</span>${seg('punctuation', [[0, t('sPunctOff')], [1, t('sPunctNormal')], [1.6, t('sPunctLong')]])}</div>
      ${toggle('smartResume', t('sSmartResume'), t('sSmartResumeHelp'))}
      ${toggle('autoStart', t('sAutoStart'), t('sAutoStartHelp'))}`;
  }
  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const segEl = b.closest('.seg');
    if (segEl) {
      const key = segEl.dataset.key;
      const v = b.dataset.v;
      update(key, key === 'theme' ? v : Number(v));
    } else if (b.classList.contains('toggle')) {
      update(b.dataset.key, !settings[b.dataset.key]);
    }
    renderSheet();
  });
  sheet.addEventListener('input', (e) => {
    if (e.target.dataset.key === 'wpm') {
      engine.setWpm(Number(e.target.value));
      e.target.nextElementSibling.textContent = `${engine.wpm} ${t('wpm')}`;
      e.target.style.setProperty('--fill', `${((engine.wpm - 100) / 1100) * 100}%`);
    }
  });

  function update(key, value) {
    settings[key] = value;
    applySettings();
    opts.onSettings?.({ ...settings });
  }

  const darkQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  function applySettings() {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && darkQuery?.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--size', String(settings.fontSize || 1));
    engine.punctuation = settings.punctuation;
    engine.smartResume = settings.smartResume;
    if (state === 'paused') requestAnimationFrame(() => (placeCursor(), scrollToCursor()));
    else renderWord(engine.index);
    renderProgress();
  }
  darkQuery?.addEventListener?.('change', applySettings);

  // ---------- Start ----------

  setState('ready');
  root.dataset.theme = 'light';
  const start = Math.max(0, Math.min(tokens.length - 1, opts.position ?? 0));
  engine.seek(start);
  renderSpeed();
  hintEl.textContent = t(settings.autoStart && !opts.resumed ? 'tapHint' : 'tapToStart');

  const begin = () => {
    applySettings();
    if (opts.resumed && start > 0) {
      // Show where we were, in context; the user picks up from there.
      enterPaused();
      toast(t('resumedAt', Math.round((start / Math.max(1, tokens.length - 1)) * 100)));
    } else if (settings.autoStart) {
      renderWord(start);
      const ms = 1100;
      leadEl.style.setProperty('--lead-ms', `${ms}ms`);
      leadEl.classList.add('run');
      leadTimer = setTimeout(play, ms);
    } else {
      renderWord(start);
    }
  };
  // Wait for the stylesheet and font so the first measurement is right.
  const ready = Promise.all([
    styles,
    Promise.race([document.fonts?.load?.(`48px 'Literata RSVP'`).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]),
  ]);
  let destroyed = false;
  ready.then(() => !destroyed && begin());

  return {
    engine,
    tokens,
    get state() {
      return state;
    },
    pause,
    play,
    /** Android back button / Escape: returns true if it was handled. */
    back() {
      if (sheetOpen) {
        closeSheet();
        return true;
      }
      if (state === 'playing' || (state === 'ready' && leadTimer)) {
        pause();
        return true;
      }
      return false;
    },
    destroy() {
      destroyed = true;
      clearTimeout(leadTimer);
      clearTimeout(positionTimer);
      opts.onPosition?.(state === 'ended' ? tokens.length - 1 : engine.index, tokens.length);
      engine.destroy();
      releaseWakeLock();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      darkQuery?.removeEventListener?.('change', applySettings);
      globalThis.CSS?.highlights?.delete('rsvp-read');
      shadow.innerHTML = '';
    },
  };
}

