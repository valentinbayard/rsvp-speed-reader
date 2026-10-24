const STRINGS = {
  fr: {
    wpm: 'mots/min',
    play: 'Lire',
    pause: 'Pause',
    resume: 'Reprendre',
    close: 'Fermer',
    settings: 'Réglages',
    contents: 'Sommaire',
    sectionStart: 'Début',
    prevSentence: 'Phrase précédente',
    nextSentence: 'Phrase suivante',
    slower: 'Plus lent',
    faster: 'Plus rapide',
    backToPosition: 'Revenir à ma position',
    tapToStart: 'Touchez pour commencer',
    tapHint: 'Touchez pour mettre en pause · Glissez ← → pour changer de phrase',
    pausedHint: 'Touchez un mot pour y aller, puis encore une fois pour lire',
    minLeft: (m) => (m < 1 ? 'moins d’une minute' : `${m} min restantes`),
    resumedAt: (pct) => `Reprise à ${pct} %`,
    done: 'Terminé',
    wordsRead: 'mots lus',
    timeSpent: 'de lecture',
    avgSpeed: 'mots/min en moyenne',
    readAgain: 'Relire',
    // Settings
    sSpeed: 'Vitesse',
    sTextSize: 'Taille du texte',
    sTheme: 'Thème',
    sThemeLight: 'Clair',
    sThemeDark: 'Sombre',
    sThemeAuto: 'Auto',
    sPunct: 'Pauses sur la ponctuation',
    sPunctOff: 'Aucune',
    sPunctNormal: 'Normales',
    sPunctLong: 'Longues',
    sSmartResume: 'Reprendre au début de la phrase',
    sSmartResumeHelp: 'Après une pause, recule jusqu’au début de la phrase en cours.',
    sAutoStart: 'Démarrer automatiquement',
    sAutoStartHelp: 'Commence la lecture dès l’ouverture d’un nouveau texte.',
  },
  en: {
    wpm: 'words/min',
    play: 'Read',
    pause: 'Pause',
    resume: 'Resume',
    close: 'Close',
    settings: 'Settings',
    contents: 'Contents',
    sectionStart: 'Beginning',
    prevSentence: 'Previous sentence',
    nextSentence: 'Next sentence',
    slower: 'Slower',
    faster: 'Faster',
    backToPosition: 'Back to my position',
    tapToStart: 'Tap to start',
    tapHint: 'Tap to pause · Swipe ← → to change sentence',
    pausedHint: 'Tap a word to go there, tap it again to read',
    minLeft: (m) => (m < 1 ? 'less than a minute' : `${m} min left`),
    resumedAt: (pct) => `Resumed at ${pct}%`,
    done: 'Done',
    wordsRead: 'words read',
    timeSpent: 'reading',
    avgSpeed: 'words/min on average',
    readAgain: 'Read again',
    sSpeed: 'Speed',
    sTextSize: 'Text size',
    sTheme: 'Theme',
    sThemeLight: 'Light',
    sThemeDark: 'Dark',
    sThemeAuto: 'Auto',
    sPunct: 'Pauses on punctuation',
    sPunctOff: 'None',
    sPunctNormal: 'Normal',
    sPunctLong: 'Long',
    sSmartResume: 'Resume at sentence start',
    sSmartResumeHelp: 'After a pause, step back to the start of the current sentence.',
    sAutoStart: 'Start automatically',
    sAutoStartHelp: 'Start reading as soon as a new text opens.',
  },
};

export const lang =
  (globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'fr'])
    .map((l) => String(l).slice(0, 2))
    .find((l) => l in STRINGS) ?? 'fr';

/** @param {keyof typeof STRINGS.fr} key */
export function t(key, ...args) {
  const v = STRINGS[lang][key] ?? STRINGS.fr[key];
  return typeof v === 'function' ? v(...args) : v;
}

export function extend(strings) {
  for (const l of Object.keys(strings)) Object.assign((STRINGS[l] ??= {}), strings[l]);
}
