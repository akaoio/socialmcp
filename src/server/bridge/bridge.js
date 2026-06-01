/**
 * bridge.js
 * HTTP relay between the MCP server and the browser extension.
 *
 * Server listens on http://localhost:8420.
 * Extension background (peer.js) long-polls GET /job and POSTs to /result/:id.
 *
 * Protocol:
 *   GET  /job        → returns next pending job as JSON (long-poll, up to 25 s)
 *   POST /result/:id → extension posts { ok, value?, error? }
 */

import http from 'http';
import { launch }       from '../launch.js';
import { resolvemedia } from './resolvemedia.js';

const PORT    = 8420;
const jobs    = [];        // queued jobs waiting for extension to pick up
const waiters = [];        // pending GET /job responses waiting for a job
const pending = new Map(); // id → { resolve, reject, timer }

let lastpeerat = 0;     // timestamp of last GET /job from the extension
let launching  = false; // true while a browser launch is in progress

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url, 'http://x');

  if (req.method === 'GET' && u.pathname === '/job') {
    lastpeerat = Date.now();
    if (jobs.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jobs.shift()));
      return;
    }
    const reply = (job) => {
      clearTimeout(t);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(job));
    };
    const t = setTimeout(() => {
      waiters.splice(waiters.indexOf(reply), 1);
      res.writeHead(204);
      res.end();
    }, 25000);
    waiters.push(reply);
    req.on('close', () => {
      clearTimeout(t);
      const i = waiters.indexOf(reply);
      if (i >= 0) waiters.splice(i, 1);
    });
    return;
  }

  if (req.method === 'POST' && u.pathname.startsWith('/result/')) {
    const id = u.pathname.slice(8);
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        clearTimeout(p.timer);
        try {
          const data = JSON.parse(body);
          if (data.ok) p.resolve(data.value ?? null);
          else p.reject(new Error(data.error ?? 'unknown error from extension'));
        } catch { p.reject(new Error('malformed result from extension')); }
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => process.stderr.write(`socialmcp: relay on http://localhost:${PORT}\n`));
server.on('error', err => process.stderr.write(`socialmcp: relay error — ${err.message}\n`));

export const bridge = {
  async send(platform, action, params, timeout = 30000) {
    const id      = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const payload = resolvemedia(params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const qi = jobs.findIndex(j => j.id === id);
        if (qi >= 0) jobs.splice(qi, 1);
        reject(new Error(
          `socialmcp: timeout — extension did not respond for ${platform}.${action}. ` +
          `Is the extension loaded and the browser open?`
        ));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      const job = { id, platform, action, params: payload ?? {} };
      if (waiters.length > 0) waiters.shift()(job);
      else jobs.push(job);

      const peerstale = Date.now() - lastpeerat > 5000;
      if (peerstale && !launching) {
        launching = true;
        setTimeout(() => {
          if (!pending.has(id)) { launching = false; return; }
          if (Date.now() - lastpeerat <= 5000) { launching = false; return; }
          launch()
            .catch(e => process.stderr.write(`socialmcp: ${e.message}\n`))
            .finally(() => { setTimeout(() => { launching = false; }, 30000); });
        }, 2000);
      }
    });
  },
};
