/**
 * cookies.js
 * Returns Facebook cookies for integration tests.
 *
 * Priority:
 *  1. FACEBOOK_COOKIES env var (JSON array)
 *  2. Auto-extract from local Chromium profile via scripts/extractcookies.js
 *
 * Returns null if cookies are unavailable (tests will be skipped).
 */
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function getcookies() {
  if (process.env.FACEBOOK_COOKIES) {
    try { return JSON.parse(process.env.FACEBOOK_COOKIES); } catch { return null; }
  }
  try {
    const out     = execFileSync('node', [join(ROOT, 'scripts/extractcookies.js')], { encoding: 'utf8' });
    const cookies = JSON.parse(out);
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}
