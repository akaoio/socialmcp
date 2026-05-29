/**
 * index.js
 * MCP server entry point.
 *
 * Transport: stdio  (add to Claude Desktop / any MCP client as a local process)
 * Bridge:    WebSocket on 127.0.0.1:SOCIALMCP_PORT (default 3456)
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Bridge from './bridge.js';

const bridge = new Bridge().start();
const mcp = new McpServer({ name: 'socialmcp', version: '1.0.0' });

// Reusable schema fragments
const platform = z.enum(['facebook', 'x', 'instagram', 'threads']);
const user = z.string().describe('Username or full profile URL');

function reply(r) {
  return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
}

// ── Tools ────────────────────────────────────────────────────────────────────

mcp.tool(
  'post',
  'Create a new post on a social media platform',
  {
    platform,
    content: z.string().describe('Text content of the post'),
    media: z.array(z.string()).optional()
      .describe('File paths or URLs of images/videos to attach'),
  },
  async ({ platform: p, content, media }) =>
    reply(await bridge.send(p, 'post', { content, media }))
);

mcp.tool(
  'comment',
  'Comment on a post',
  {
    platform,
    post_url: z.string().describe('URL of the post to comment on'),
    content: z.string(),
  },
  async ({ platform: p, post_url, content }) =>
    reply(await bridge.send(p, 'comment', { post_url, content }))
);

mcp.tool(
  'react',
  'Like or react to a post',
  {
    platform,
    post_url: z.string().describe('URL of the post'),
    reaction: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry']).optional()
      .describe('Reaction type (default: like)'),
  },
  async ({ platform: p, post_url, reaction = 'like' }) =>
    reply(await bridge.send(p, 'react', { post_url, reaction }))
);

mcp.tool(
  'scroll',
  'Scroll the feed and retrieve posts',
  {
    platform,
    count: z.number().int().min(1).max(50).optional()
      .describe('Number of posts to retrieve (default: 10)'),
  },
  async ({ platform: p, count = 10 }) =>
    reply(await bridge.send(p, 'scroll', { count }))
);

mcp.tool(
  'search',
  'Search for users, posts, or groups on a platform',
  {
    platform,
    query: z.string(),
    type: z.enum(['posts', 'users', 'groups', 'pages']).optional()
      .describe('Category to search (default: posts)'),
  },
  async ({ platform: p, query, type = 'posts' }) =>
    reply(await bridge.send(p, 'search', { query, type }))
);

mcp.tool(
  'follow',
  'Follow a user on a platform',
  { platform, user },
  async ({ platform: p, user: u }) =>
    reply(await bridge.send(p, 'follow', { user: u }))
);

mcp.tool(
  'unfollow',
  'Unfollow a user on a platform',
  { platform, user },
  async ({ platform: p, user: u }) =>
    reply(await bridge.send(p, 'unfollow', { user: u }))
);

mcp.tool(
  'message',
  'Send a direct message to a user',
  {
    platform,
    user,
    content: z.string(),
  },
  async ({ platform: p, user: u, content }) =>
    reply(await bridge.send(p, 'message', { user: u, content }))
);

mcp.tool(
  'profile',
  'Get public profile information of a user',
  {
    platform,
    user: z.string().describe('Username, full profile URL, or "me" for the current account'),
  },
  async ({ platform: p, user: u }) =>
    reply(await bridge.send(p, 'profile', { user: u }))
);

// ── Connect ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await mcp.connect(transport);
