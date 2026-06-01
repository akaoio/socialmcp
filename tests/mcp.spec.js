/**
 * MCP protocol tests
 *
 * Verifies the MCP server speaks correct JSON-RPC 2.0 over stdio:
 *   - initialize handshake succeeds
 *   - tools/list returns all expected tools with correct schemas
 *
 * No browser or extension required — pure server-layer checks.
 * These are the first steps every AI agent performs before calling tools.
 *
 * Run: npm test -- --grep mcp
 */
import { test, expect } from '@playwright/test';
import { startmcp }     from './mcpclient.js';

let mcp;

test.beforeAll(async () => {
  mcp = await startmcp();
});

test.afterAll(() => {
  mcp?.close();
});

test('initialize: server returns protocol version and capabilities', async () => {
  // initialize was already called in startmcp(); call again to verify idempotent response
  const result = await mcp.initialize();
  expect(result).toHaveProperty('protocolVersion');
  expect(typeof result.protocolVersion).toBe('string');
  expect(result).toHaveProperty('serverInfo');
  expect(result.serverInfo.name).toBe('socialmcp');
});

test('tools/list: returns all expected tools', async () => {
  const { tools } = await mcp.tools();
  const names = tools.map(t => t.name);
  expect(names).toContain('post');
  expect(names).toContain('scan');
  expect(names).toContain('screenshot');
  expect(names).toContain('getdom');
  expect(names).toContain('getaxstree');
  expect(names).toContain('ocr');
});

test('tools/list: post tool advertises dryrun parameter', async () => {
  const { tools }  = await mcp.tools();
  const post       = tools.find(t => t.name === 'post');
  expect(post).toBeDefined();
  expect(post.inputSchema.properties).toHaveProperty('dryrun');
});

test('tools/list: all tools have platform parameter with correct enum', async () => {
  const { tools } = await mcp.tools();
  for (const tool of tools) {
    const platform = tool.inputSchema.properties?.platform;
    expect(platform, `tool ${tool.name} missing platform param`).toBeDefined();
    expect(platform.enum).toEqual(expect.arrayContaining(['facebook', 'x', 'instagram', 'threads']));
  }
});
