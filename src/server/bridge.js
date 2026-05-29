/**
 * bridge.js
 * ZEN relay that bridges MCP server tools to browser extensions.
 *
 * Architecture:
 *   MCP Server (index.js)
 *       └── bridge.send(platform, action, params)
 *               └── ZEN relay (ws://127.0.0.1:PORT/zen)
 *                       └── Extension background.js (ZEN peer)
 *                               └── chrome.tabs.sendMessage
 *                                       └── content script (DOM)
 *
 * Security:
 *   Commands and responses live in the user namespace ~<pair.pub>/cmd|res/<id>.
 *   ZEN enforces that only writes signed with pair.priv are accepted for that
 *   namespace — an attacker connected to the relay cannot inject commands or
 *   forge responses without the private key.
 *
 *   Secret priority:
 *     1. SOCIALMCP_SECRET env var  (recommended — set a strong random value)
 *     2. Built-in default          (acceptable for localhost-only use)
 */

import { createServer } from 'node:http';
import ZEN from '@akaoio/zen/zen.js';
import '@akaoio/zen/lib/wire.js'; // adds opt.web inbound WebSocket support

const DEFAULT_PORT   = parseInt(process.env.SOCIALMCP_PORT ?? '8420');
const DEFAULT_SECRET = 'socialmcp-local-default';

export default class Bridge {
  constructor(port = DEFAULT_PORT) {
    this.port  = port;
    this.seq   = 0;
    this.zen   = null;
    this.pair  = null;
    this.ready = null;
  }

  start() {
    const srv  = createServer().listen(this.port, '127.0.0.1');
    this.zen   = new ZEN({ web: srv, file: false, axe: false });
    this.ready = this._initpair();
    return this;
  }

  async _initpair() {
    const secret = process.env.SOCIALMCP_SECRET ?? DEFAULT_SECRET;
    if (secret === DEFAULT_SECRET) {
      process.stderr.write('[socialmcp] WARNING: using default secret — set SOCIALMCP_SECRET for security\n');
    }
    const seed  = await ZEN.hash(secret, null, null, { name: 'SHA-256', encode: 'base62' });
    this.pair   = await ZEN.pair(null, { seed });
    process.stderr.write(`[socialmcp] zen relay on ws://127.0.0.1:${this.port}/zen (pub: ${this.pair.pub})\n`);
  }

  async send(platform, action, params, timeout = 30000) {
    await this.ready;
    const zen  = this.zen;
    const pair = this.pair;
    const ns   = '~' + pair.pub;
    const id   = String(++this.seq);
    const auth = { authenticator: pair };

    return new Promise((resolve, reject) => {
      let done  = false;
      const cmd = zen.get(ns).get('cmd').get(id);
      const res = zen.get(ns).get('res').get(id);

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cmd.put(null, null, auth);
        reject(new Error(`Timeout (${timeout}ms): ${platform}.${action}`));
      }, timeout);

      res.on((raw) => {
        if (!raw || done) return;
        done = true;
        res.off();
        clearTimeout(timer);
        cmd.put(null, null, auth);
        res.put(null, null, auth);
        try {
          const msg = JSON.parse(raw);
          msg.err ? reject(new Error(msg.err)) : resolve(msg.ok);
        } catch (e) {
          reject(e);
        }
      });

      cmd.put(JSON.stringify({ platform, action, params, ts: Date.now() }), null, auth);
    });
  }
}
