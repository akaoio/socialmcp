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

import { schema }                from './schema.js';
import { mcpserver }             from './mcpserver.js';
import { stdioservertransport }  from './stdioservertransport.js';
import Bridge from './bridge.js';
import { ocr } from './ocr.js';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const bridge = new Bridge().start();
const mcp = new mcpserver({ name: 'socialmcp', version: '1.0.0' });

// Reusable schema fragments
const platform = schema.enum(['facebook', 'x', 'instagram', 'threads']);

function reply(r) {
  return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
}

// Convert a local file path to a base64 data URL (only for local paths).
// The content script fetches media via data URL — it cannot access the filesystem.
function mediatourl(p) {
  if (p.startsWith('data:') || p.startsWith('http')) return p;
  const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };
  const mime = mimes[extname(p).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
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
    reply(await bridge.send(p, 'post', { page_url, content, media: (media ?? []).map(mediatourl) }))
);

mcp.tool(
  'scan',
  'Scan and return the list of Pages managed by the current account',
  { platform },
  async ({ platform: p }) =>
    reply(await bridge.send(p, 'scan', {}))
);

// ── Debug tools ───────────────────────────────────────────────────────────────

mcp.tool(
  'screenshot',
  'Take a screenshot of the current platform tab. Returns a PNG image.',
  { platform },
  async ({ platform: p }) => {
    const { dataUrl } = await bridge.send(p, 'screenshot', {});
    const data = dataUrl.replace(/^data:image\/png;base64,/, '');
    return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
  }
);

mcp.tool(
  'getdom',
  'Get the full HTML source of the current platform tab for debugging.',
  { platform },
  async ({ platform: p }) => reply(await bridge.send(p, 'getdom', {}))
);

mcp.tool(
  'getaxstree',
  'Get a compact accessibility tree of the current platform tab (roles, labels, interactive elements).',
  { platform },
  async ({ platform: p }) => reply(await bridge.send(p, 'getaxstree', {}))
);

mcp.tool(
  'ocr',
  'Extract visible text from the current platform tab using Tesseract OCR.',
  {
    platform,
    lang: schema.string().optional().describe('Tesseract language code (default: eng)'),
  },
  async ({ platform: p, lang }) => {
    const { dataUrl } = await bridge.send(p, 'screenshot', {});
    const text = await ocr(dataUrl, lang ?? 'eng');
    return reply({ text });
  }
);

// ── Connect ───────────────────────────────────────────────────────────────────

const transport = new stdioservertransport();
await mcp.connect(transport);
