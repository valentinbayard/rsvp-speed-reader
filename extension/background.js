// Injects the reader into the current tab: the article is read from the page
// as you see it, so subscriber-only content works when you are logged in.

const FILES = ['web/vendor/Readability.js', 'web/core/extract.js', 'content.js'];

async function start(tab) {
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
  } catch (e) {
    // chrome:// pages, the Web Store, PDF viewer…
    console.warn('Lecture rapide: cannot run on this page', e);
  }
}

chrome.action.onClicked.addListener(start);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'read-selection', title: 'Lecture rapide de la sélection', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'read-page', title: 'Lecture rapide de cette page', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((_info, tab) => start(tab));
