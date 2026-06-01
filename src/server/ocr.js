import { createWorker } from 'tesseract.js';

// ocr(dataUrl, lang?) — runs Tesseract OCR on a PNG data URL via tesseract.js.
// No system dependency — works after plain npm install.
// Returns the extracted text.
export async function ocr(dataUrl, lang = 'eng') {
  const worker = await createWorker(lang);
  try {
    const { data: { text } } = await worker.recognize(dataUrl);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}
