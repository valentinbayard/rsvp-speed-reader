// @rsvp-reader/shared - Main entry point

export {
  RSVPReader,
  getORPIndex,
  processWord,
  parseTextToWords,
  getWordDuration,
  rsvpUtils
} from './rsvp-engine.js';

export {
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  validateSettings
} from './settings.js';

export {
  cleanArticleText,
  extractUrlFromText,
  isValidUrl
} from './text-utils.js';
