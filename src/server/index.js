/**
 * index.js
 * MCP server entry point.
 *
 * Transport: stdio  (add to Claude Desktop / any MCP client as a local process)
 *
 * Claude Desktop config example:
 * {
 *   "mcpServers": {
 *     "socialmcp": {
 *       "command": "node",
 *       "args": ["/path/to/src/server/index.js"]
 *     }
 *   }
 * }
 */

import { McpServer, StdioServerTransport, schema } from './mcp.js';
import Bridge from './bridge.js';

const bridge = new Bridge().start();
const mcp = new McpServer({ name: 'socialmcp', version: '1.0.0' });

// Reusable schema fragments
const platform = schema.enum(['facebook', 'x', 'instagram', 'threads']);

function reply(r) {
  return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
}

// ── Tools ────────────────────────────────────────────────────────────────────

mcp.tool(
  'post',
  'Create a new post on a social media platform',
  {
    platform,
    page_url: schema.string().describe('Full URL of the Page wall to post to (e.g. https://www.facebook.com/akaoofficial)'),
    content: schema.string().describe('Text content of the post'),
    media: schema.array(schema.string()).optional()
      .describe('File paths or URLs of images/videos to attach'),
  },
  async ({ platform: p, page_url, content, media }) =>
    reply(await bridge.send(p, 'post', { page_url, content, media }))
);

mcp.tool(
  'scan',
  'Scan and return the list of Pages managed by the current account',
  { platform },
  async ({ platform: p }) =>
    reply(await bridge.send(p, 'scan', {}))
);

// ── Connect ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await mcp.connect(transport);
