import { spawn }      from 'child_process';
import { existsSync }  from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir }       from 'os';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXT     = join(ROOT, 'build/browser');
const PROFILE = join(homedir(), '.socialmcp', 'profile');

const CANDIDATES = [
  process.env.SOCIALMCP_CHROMIUM,
  '/usr/lib/chromium/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

// launch() — spawns Chromium with the socialmcp extension loaded.
// Uses a dedicated user-data-dir so the extension is always active
// regardless of whether another Chrome instance is already running.
// Returns a Promise that resolves when the process has started successfully.
export function launch() {
  return new Promise((resolve, reject) => {
    if (!existsSync(EXT)) {
      return reject(new Error(
        `socialmcp: extension not built — run npm run build:ext first (expected: ${EXT})`
      ));
    }

    const bin = CANDIDATES.find(p => existsSync(p));
    if (!bin) {
      return reject(new Error(
        'socialmcp: cannot find Chromium — set SOCIALMCP_CHROMIUM env var to the binary path'
      ));
    }

    const proc = spawn(bin, [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${PROFILE}`,
      `--load-extension=${EXT}`,
      `--disable-extensions-except=${EXT}`,
    ], { detached: true, stdio: 'ignore' });

    proc.on('error', reject);
    proc.on('spawn', () => {
      proc.unref();
      process.stderr.write(`socialmcp: launched browser (${bin})\n`);
      resolve();
    });
  });
}
