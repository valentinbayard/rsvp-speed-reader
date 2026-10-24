# Lecture rapide

A speed reader (RSVP): words are flashed one at a time at the same spot, with
the focus letter in red, so your eyes never have to move.

It reads from anywhere:

| Where | How |
|---|---|
| **Android, any app** | Tap the **accessibility button** (or the quick settings tile). The app reads the text on screen, including subscriber-only articles in your news apps, because it reads what *your* logged-in app is showing. |
| Android, selected text | Select text → **Lecture rapide** in the selection menu. |
| Android, shared link | Share → **Lecture rapide**. If the site has a paywall, use "Open the page to log in" once: the in-app browser keeps its cookies. |
| Chrome (desktop) | Extension: toolbar button, **Alt+Shift+R**, or right-click → "Lecture rapide". Reads the page as you see it, logins included. |
| Web | Paste a text (or a public link) into the web app. |

## Reading

- **Tap** anywhere to pause. The text around the word appears, with the word
  highlighted exactly where the flashing word was. Scroll freely.
- **Tap a word** to move there, then **tap it again** (or ▶) to continue from it.
- ▶ resumes from the **start of the current sentence**. You can turn this off in Aa.
- While reading:
  - **swipe ← →** to skip to the next or previous sentence;
  - **drag ↑ ↓** to change the speed.
- **Contents**:
  - The ☰ button, or tapping the title, lists the article's sections, with the current one highlighted and the time each one takes. Tap a section to read from there.
  - On wide screens the list stays beside the text while paused.
  - While reading, the current section's name sits above the word.
  - Section titles come from the page; for plain text they are guessed from short title-like lines.
- The scrubber at the bottom (with a mark per section) jumps anywhere. "Back to my position" brings you back after scrolling away.
- Keyboard:

  | Key | Action |
  |---|---|
  | `Space` | Pause / read |
  | `←` `→` | Previous / next sentence |
  | `Shift` + `←` `→` | Previous / next word |
  | `↑` `↓` | Speed |
  | `[` `]` | Previous / next section |
  | `t` | Contents |
  | `Esc` | Pause, then close |

- Your position in each text is remembered.

Words and timing follow Spritz's patent ([US 8,903,174](https://patents.google.com/patent/US8903174B2)):
- The red letter is the 1st letter of 1-letter words, the 2nd for 2–5 letters, the 3rd for 6–9, the 4th for 10–13 and the 5th beyond. Only letters and digits count, so `c'est` shows `c'[e]st`.
- Words of more than 13 letters are split into even pieces, at their own hyphens or at syllable breaks (TeX hyphenation patterns for French and English, a simple syllable rule for other languages): `particu-` `lièrement`.
- A number and its unit are shown together: `12 000 km`, `3 h`.
- Words of more than 7 letters stay 1.3× longer, more than 13 letters 1.6×; numbers and names a little longer too. Times are scaled so the average word lasts exactly 60000/WPM ms.
- After a sentence there is a pause of 1, 2.2 or 3.3 words' time depending on its length (up to 7 words, up to 22, more). Paragraphs end with a longer pause. Commas and asides (dashes, parentheses) get a short one, which the patent does not have.
- A stop followed by a lower-case word (« Viens ! » dit-il) does not end the sentence.
- The first few words after starting are a little slower, so your eyes can lock on.

## Install

Every push to `main` builds a release: **[Releases → latest](https://github.com/valentinbayard/rsvp-speed-reader/releases/latest)**.

- **Android:**
  1. Download `lecture-rapide.apk` on the phone and open it.
  2. In the app, tap **Activer**, then switch on "Lecture rapide · lire l'écran" and its shortcut.
  3. On Android 13 and later, sideloaded apps need one extra step: *App info → ⋮ → Allow restricted settings*.
- **Chrome:**
  1. Unzip `lecture-rapide-extension.zip`.
  2. Open `chrome://extensions` and enable developer mode.
  3. Click "Load unpacked" and pick the unzipped folder.

### Signing the APK (so updates install over the previous version)

By default, CI signs the APK with a throwaway key. Each new build then has to
replace the old one by uninstalling first (your reading history is lost). To
keep a stable key:

1. Create a key once:
   `keytool -genkeypair -keystore release.jks -alias rsvp -keyalg RSA -keysize 2048 -validity 36500`
2. Add these repository secrets (Settings → Secrets and variables → Actions):
   - `RSVP_KEYSTORE_BASE64`: the output of `base64 -w0 release.jks`
   - `RSVP_KEYSTORE_PASSWORD`
   - `RSVP_KEY_ALIAS` (`rsvp`)
   - `RSVP_KEY_PASSWORD`

## Layout

```
web/         The reader, shared by all three apps (vanilla JS modules, no build step)
  core/        tokenizer, timing, playback engine, storage, page extraction
  reader/      the reader UI (shadow DOM component)
android/     Kotlin app: WebView host, accessibility service, share/selection, login browser
extension/   Chrome MV3 extension (run `npm run build:extension` before loading it)
worker/      Cloudflare Worker that fetches public links for the web version
tests/       unit tests (node:test), browser tests (Playwright)
```

## Development

```sh
npm test                       # core unit tests
npm run serve                  # web app on http://localhost:8080
node tests/e2e.mjs             # reader in headless Chromium (needs playwright)
node tests/extension.mjs       # extension in Chromium
cd android && ./gradlew assembleRelease testReleaseUnitTest
```

The previous version of the project is kept on the `old` branch.
