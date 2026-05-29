/**
 * bridge.js
 * WebSocket server that manages connections from browser extensions.
 *
 * Architecture:
 *   MCP Server (index.js)
 *       └── bridge.send(platform, action, params)
 *               └── WebSocket (ws://127.0.0.1:PORT)
 *                       └── Extension background.js
 *                               └── chrome.tabs.sendMessage
 *                                       └── content script (DOM)
 */

import { WebSocketServer } from 'ws';

const DEFAULT_PORT = parseInt(process.env.SOCIALMCP_PORT ?? '3456');

export default class Bridge {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.connections = new Map(); // connId -> { ws, platforms: string[] }
    this.pending = new Map();     // msgId -> { resolve, reject, timer }
    this.seq = 0;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port, host: '127.0.0.1' });
    this.wss.on('connection', ws => this.onconnect(ws));
    process.stderr.write(`[socialmcp] bridge on ws://127.0.0.1:${this.port}\n`);
    return this;
  }

  onconnect(ws) {
    const id = ++this.seq;
    this.connections.set(id, { ws, platforms: [] });

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'register') {
        this.connections.get(id).platforms = msg.platforms ?? [];
        process.stderr.write(`[socialmcp] ext#${id} platforms: ${msg.platforms.join(', ')}\n`);
        return;
      }

      if (msg.type === 'response') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
      }
    });

    ws.on('close', () => {
      this.connections.delete(id);
      process.stderr.write(`[socialmcp] ext#${id} disconnected\n`);
    });

    ws.on('error', () => ws.close());
  }

  send(platform, action, params, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let conn = null;
      for (const c of this.connections.values()) {
        if (c.platforms.includes(platform)) { conn = c; break; }
      }
      if (!conn) {
        return reject(new Error(`No extension connected for platform: ${platform}`));
      }

      const id = ++this.seq;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout (${timeout}ms): ${platform}.${action}`));
      }, timeout);

      this.pending.set(id, { resolve, reject, timer });
      conn.ws.send(JSON.stringify({ id, platform, action, params }));
    });
  }
}
