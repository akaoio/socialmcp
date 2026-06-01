import { execFile }    from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join }         from 'path';
import { tmpdir }       from 'os';
import { promisify }    from 'util';

const exec = promisify(execFile);

// ocr(dataUrl, lang?) — runs Tesseract OCR on a PNG data URL.
// Requires: tesseract-ocr to be installed (run ./install.sh --server).
// Returns the extracted text.
export async function ocr(dataUrl, lang = 'eng') {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const base   = join(tmpdir(), `socialmcp-ocr-${Date.now()}`);
  const png    = `${base}.png`;
  const out    = `${base}.txt`;

  writeFileSync(png, Buffer.from(base64, 'base64'));
  try {
    await exec('tesseract', [png, base, '-l', lang]);
    return readFileSync(out, 'utf8').trim();
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('socialmcp: tesseract not found — run ./install.sh --server to install it');
    }
    throw e;
  } finally {
    try { unlinkSync(png); } catch {}
    try { unlinkSync(out); } catch {}
  }
}
