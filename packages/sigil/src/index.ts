/** sigil — launch a tool from a host app into a separate origin, borrowing the signed-in user's session.
 *
 * A sigil is a signed seal. Two capabilities let a host app hand a user off to a separate tool without
 * the tool ever holding a server-side credential: `launch` mints and verifies a signed, expiring
 * cross-origin token carrying the visitor's claims; `proxy` is the borrowed-session protocol plus the
 * pure host-side handler that calls the host's own API with the user's session; `opener` is the
 * extension-free transport over a `window.opener` tab (tool end and host end). */
export type { Claims } from './launch'
export { mintToken, verifyToken } from './launch'
export { openerTransport, serveOpener } from './opener'
export type {
  BridgeMessage,
  Launch,
  PingReply,
  ProxyConfig,
  ProxyMethod,
  ProxyReply,
  ProxyRequest,
  StashReply,
  Transport
} from './proxy'
export {
  bridgeMessageSchema,
  getLaunchSchema,
  handleProxy,
  launchSchema,
  pingReplySchema,
  pingSchema,
  proxyMessageSchema,
  proxyReplySchema,
  proxyRequestSchema,
  stashLaunchSchema,
  stashReplySchema
} from './proxy'
