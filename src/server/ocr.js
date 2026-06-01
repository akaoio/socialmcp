import { createWorker } from 'tesseract.js';
import { tmpdir }       from 'node:os';
import { join }         from 'node:path';

// Cache traineddata in tmpdir so it never appears in the repo.
const CACHE = join(tmpdir(), 'socialmcp-tessdata');

// ocr(dataUrl, lang?) — runs Tesseract OCR on a PNG data URL via tesseract.js.
// No system dependency — works after plain npm install.
// Returns the extracted text.
export async function ocr(dataUrl, lang = 'eng') {
  const worker = await createWorker(lang, 1, { cachePath: CACHE });
  try {
    const { data: { text } } = await worker.recognize(dataUrl);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}
