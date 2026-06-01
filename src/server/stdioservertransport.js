import { createInterface } from 'node:readline';

export class stdioservertransport {
  async start() {
    const srv = this._srv;
    const rl   = createInterface({ input: process.stdin, terminal: false });

    const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
    const ok    = (id, result)        => write({ jsonrpc: '2.0', id, result });
    const fail  = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });

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
        fail(id, -32601, `Method not found: ${method}`);
      }
    });

    rl.on('close', () => process.exit(0));
  }
}
