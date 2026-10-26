// worker.js — runs all heavy work off the main thread so the UI never freezes.
// Receives a File, returns ONLY the stats object. Raw chat text never goes back to the page.

import { readChatFile } from './filereader.js';
import { parseChat } from './parser.js';
import { computeStats } from './stats.js';

self.onmessage = async (event) => {
  const { file } = event.data || {};
  try {
    self.postMessage({ type: 'progress', step: 'reading' });
    let text = await readChatFile(file);

    self.postMessage({ type: 'progress', step: 'parsing' });
    let parsed = parseChat(text);
    text = null; // drop raw text as early as possible

    self.postMessage({ type: 'progress', step: 'counting' });
    const stats = computeStats(parsed);
    parsed = null; // drop parsed messages too

    self.postMessage({ type: 'done', stats });
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : 'Ada masalah masa baca file.' });
  }
};
