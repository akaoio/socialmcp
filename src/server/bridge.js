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
 */

import { createServer } from 'node:http';
import ZEN from '@akaoio/zen/zen.js';
import '@akaoio/zen/lib/wire.js'; // adds opt.web inbound WebSocket support

const DEFAULT_PORT = parseInt(process.env.SOCIALMCP_PORT ?? '8420');
const NS = 'socialmcp';

export default class Bridge {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.seq  = 0;
    this.zen  = null;
  }

  start() {
    const srv = createServer().listen(this.port, '127.0.0.1');
    this.zen = new ZEN({ web: srv, file: false, axe: false });
    process.stderr.write(`[socialmcp] zen relay on ws://127.0.0.1:${this.port}/zen\n`);
    return this;
  }

  send(platform, action, params, timeout = 30000) {
    const zen = this.zen;
    const id  = String(++this.seq);
    return new Promise((resolve, reject) => {
      let done  = false;
      const cmd = zen.get(NS).get('cmd').get(id);
      const res = zen.get(NS).get('res').get(id);

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cmd.put(null);
        reject(new Error(`Timeout (${timeout}ms): ${platform}.${action}`));
      }, timeout);

      res.on((raw) => {
        if (!raw || done) return;
        done = true;
        res.off();
        clearTimeout(timer);
        cmd.put(null);
        res.put(null);
        try {
          const msg = JSON.parse(raw);
          msg.err ? reject(new Error(msg.err)) : resolve(msg.ok);
        } catch (e) {
          reject(e);
        }
      });

      cmd.put(JSON.stringify({ platform, action, params, ts: Date.now() }));
    });
  }
}
