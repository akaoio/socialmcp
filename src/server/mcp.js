/**
 * mcp.js — minimal MCP server + schema builder
 * Replaces: @modelcontextprotocol/sdk  and  zod
 * Uses only Node.js built-ins: node:readline
 */

import { createInterface } from 'node:readline';

// ── Schema builder (replaces zod) ────────────────────────────────────────────

class Sch {
  constructor(d) { this.d = d; }

  describe(t)  { return new Sch({ ...this.d, description: t }); }
  optional()   { return new Sch({ ...this.d, optional: true }); }
  int()        { return new Sch({ ...this.d, integer: true }); }
  min(n)       { return new Sch({ ...this.d, minimum: n }); }
  max(n)       { return new Sch({ ...this.d, maximum: n }); }

  json() {
    const { type, values, items, description, integer, minimum, maximum } = this.d;
    const o = {};
    if (description) o.description = description;
    if      (type === 'string') { o.type = 'string'; }
    else if (type === 'number') {
      o.type = integer ? 'integer' : 'number';
      if (minimum != null) o.minimum = minimum;
      if (maximum != null) o.maximum = maximum;
    }
    else if (type === 'enum')  { o.type = 'string'; o.enum = values; }
    else if (type === 'array') { o.type = 'array';  o.items = items.json(); }
    return o;
  }
}

export const schema = {
  string: ()       => new Sch({ type: 'string' }),
  number: ()       => new Sch({ type: 'number' }),
  enum:   (values) => new Sch({ type: 'enum', values }),
  array:  (items)  => new Sch({ type: 'array', items }),
};

// ── shape → JSON Schema inputSchema ──────────────────────────────────────────

function toinput(shape) {
  const props = {}, req = [];
  for (const [k, s] of Object.entries(shape)) {
    props[k] = s.json();
    if (!s.d.optional) req.push(k);
  }
  return { type: 'object', properties: props, ...(req.length ? { required: req } : {}) };
}

// ── MCP Server ────────────────────────────────────────────────────────────────

export class McpServer {
  constructor({ name, version }) {
    this._info  = { name, version };
    this._tools = new Map();
  }

  tool(name, desc, shape, fn) {
    this._tools.set(name, { name, description: desc, inputSchema: toinput(shape), fn });
  }

  async connect(transport) {
    transport._srv = this;
    await transport.start();
  }
}

// ── Stdio transport ───────────────────────────────────────────────────────────

export class StdioServerTransport {
  async start() {
    const srv = this._srv;
    const rl   = createInterface({ input: process.stdin, terminal: false });

    const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
    const ok    = (id, result)           => write({ jsonrpc: '2.0', id, result });
    const fail  = (id, code, message)    => write({ jsonrpc: '2.0', id, error: { code, message } });

    rl.on('line', async raw => {
      const line = raw.trim();
      if (!line) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      const { id, method, params } = msg;

      if (method === 'initialize') {
        ok(id, {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: srv._info,
        });

      } else if (method === 'ping') {
        ok(id, {});

      } else if (method === 'tools/list') {
        ok(id, {
          tools: [...srv._tools.values()].map(t => ({
            name: t.name, description: t.description, inputSchema: t.inputSchema,
          })),
        });

      } else if (method === 'tools/call') {
        const t = srv._tools.get(params?.name);
        if (!t) { fail(id, -32601, `Unknown tool: ${params?.name}`); return; }
        try {
          const result = await t.fn(params?.arguments ?? {});
          ok(id, result);
        } catch (e) {
          fail(id, -32603, e?.message ?? String(e));
        }

      } else if (id != null) {
        // Unknown request (not a notification) — respond with error
        fail(id, -32601, `Method not found: ${method}`);
      }
      // Notifications (no id) are silently ignored
    });

    rl.on('close', () => process.exit(0));
  }
}
