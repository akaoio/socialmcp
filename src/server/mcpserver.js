function toinput(shape) {
  const props = {}, req = [];
  for (const [k, s] of Object.entries(shape)) {
    props[k] = s.json();
    if (!s.d.optional) req.push(k);
  }
  return { type: 'object', properties: props, ...(req.length ? { required: req } : {}) };
}

export class mcpserver {
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
