/**
 * bridge.js
 * Placeholder transport between the MCP server and the browser extension.
 *
 * The transport layer has not been implemented yet. Until it is, every
 * MCP tool call resolves into a clear error so AI clients see why nothing
 * happens. Use the extension dashboard to drive actions manually for now.
 */

export default class Bridge {
  start() { return this; }

  async send(platform, action /* , params, timeout */) {
    throw new Error(
      `socialmcp: no transport between MCP server and extension yet ` +
      `(requested ${platform}.${action}). Use the extension dashboard for now.`
    );
  }
}
