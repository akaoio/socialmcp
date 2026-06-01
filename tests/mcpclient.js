/**
 * mcpclient.js
 * MCP JSON-RPC stdio client for integration tests.
 *
 * Usage:
 *   const mcp = await startmcp();
 *   const { tools } = await mcp.tools();
 *   const result    = await mcp.call('scan', { platform: 'facebook' });
 *   await mcp.close();
 *
 * For tools that need the browser extension, launch Chromium with the
 * extension first, then call mcp.waitforpeer() before mcp.call().
 */
import { spawn }        from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export class mcpclient {
  constructor(proc) {
    this._proc    = proc;
    this._pending = new Map();
    this._id      = 0;
    this._buf     = '';

    proc.stdout.on('data', chunk => {
      this._buf += chunk.toString();
      const lines = this._buf.split('\n');
      this._buf = lines.pop(); // keep any incomplete trailing line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && this._pending.has(msg.id)) {
            const { resolve, reject } = this._pending.get(msg.id);
            this._pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch { /* ignore non-JSON lines (e.g. debug output on stdout) */ }
      }
    });

    // If the server exits unexpectedly, reject all pending requests immediately.
    proc.on('exit', (code) => {
      const err = new Error(`socialmcp server exited with code ${code}`);
      for (const { reject } of this._pending.values()) reject(err);
      this._pending.clear();
    });
  }

  _rpc(method, params) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  initialize() {
    return this._rpc('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test', version: '1.0' },
      capabilities: {},
    });
  }

  tools() {
    return this._rpc('tools/list', {});
  }

  /**
   * Call an MCP tool and return the parsed result.
   * - Image tools (screenshot) return { type, data, mimeType }.
   * - Text tools return the JSON-parsed object from content[0].text.
   */
  async call(name, args = {}) {
    const result  = await this._rpc('tools/call', { name, arguments: args });
    const content = result?.content ?? [];
    if (content[0]?.type === 'image') return content[0];
    try { return JSON.parse(content[0]?.text ?? 'null'); } catch { return content[0]?.text; }
  }

  /**
   * Poll the bridge /ready endpoint until the extension peer.js has connected.
   * Throws if no peer connects within `timeout` ms.
   */
  async waitforpeer(timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        const r = await fetch('http://localhost:8765/ready');
        if (r.status === 200) return; // peer connected
      } catch { /* bridge not up yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('socialmcp: timed out waiting for extension peer to connect to bridge');
  }

  close() {
    this._proc?.kill('SIGTERM');
  }
}

/**
 * startmcp() — spawns the MCP server and sends the initialize handshake.
 * Returns a ready-to-use mcpclient instance.
 * Passes SOCIALMCP_NO_AUTOLAUNCH=1 so the server does NOT auto-launch Chromium;
 * callers that need the browser must launch it themselves before calling tools.
 */
export async function startmcp() {
  const proc = spawn('node', [join(ROOT, 'src/server/index.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, SOCIALMCP_NO_AUTOLAUNCH: '1' },
  });
  const client = new mcpclient(proc);
  await client.initialize();
  return client;
}
