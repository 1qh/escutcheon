import { z } from 'zod'
/** The borrowed-session proxy protocol, and the pure host-side handler.
 *
 * A tool on a SEPARATE origin cannot call the host's API directly — it carries neither the host's
 * origin-scoped session cookie nor a CORS grant. So it asks the HOST (a script the host loads on its own
 * origin — a browser extension's background worker, or the opener tab) to make the call for it: the tool
 * sends a `ProxyRequest` (method, path, optional bearer, body), the host runs `handleProxy` which fetches
 * the host's API with `credentials: 'include'` so the user's own session authenticates it, and returns a
 * `ProxyReply`. The session and any credential never leave the host and never reach the tool's server —
 * "we can't misuse what we never hold".
 *
 * `handleProxy` is framework-free: the path allowlist is a predicate the caller supplies (so only the
 * endpoints the tool needs are reachable), and the API origin is a parameter. When the tool holds the
 * session token it sends it as `token`; when the HOST holds a non-cookie credential the tool never sees
 * (a bearer read from the host's own storage), the host supplies `authorize` to inject it. The schemas below
 * are the wire contract between the tool and the host — a proxied call, the launch stash/retrieve
 * handshake, and a ping. */
const methodSchema = z.enum(['GET', 'POST'])
const proxyRequestSchema = z.object({
  binary: z.boolean().optional(),
  body: z.unknown().optional(),
  method: methodSchema,
  path: z.string(),
  token: z.string().optional()
})
const proxyReplySchema = z.object({
  b64: z.string().optional(),
  error: z.string().optional(),
  json: z.unknown().optional(),
  ok: z.boolean(),
  status: z.number()
})
const launchSchema = z.object({ claims: z.record(z.string(), z.string()), token: z.string() })
const stashLaunchSchema = launchSchema.extend({ kind: z.literal('stash-launch') })
const getLaunchSchema = z.object({ kind: z.literal('get-launch'), launchId: z.string() })
const proxyMessageSchema = proxyRequestSchema.extend({ kind: z.literal('proxy') })
const pingSchema = z.object({ kind: z.literal('ping') })
const bridgeMessageSchema = z.discriminatedUnion('kind', [
  stashLaunchSchema,
  getLaunchSchema,
  proxyMessageSchema,
  pingSchema
])
const stashReplySchema = z.object({ launchId: z.string() })
const pingReplySchema = z.object({ pong: z.literal(true), version: z.string() })
type BridgeMessage = z.infer<typeof bridgeMessageSchema>
type Launch = z.infer<typeof launchSchema>
type PingReply = z.infer<typeof pingReplySchema>
interface ProxyConfig {
  allow: (path: string, method: ProxyMethod) => boolean
  apiOrigin: string
  authorize?: () => string | undefined
}
type ProxyMethod = z.infer<typeof methodSchema>
type ProxyReply = z.infer<typeof proxyReplySchema>
type ProxyRequest = z.infer<typeof proxyRequestSchema>
type StashReply = z.infer<typeof stashReplySchema>
type Transport = (request: ProxyRequest) => Promise<ProxyReply>
const bytesToB64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x80_00
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunk))
  return btoa(binary)
}
const handleProxy = async (request: ProxyRequest, config: ProxyConfig): Promise<ProxyReply> => {
  if (!config.allow(request.path, request.method)) return { error: 'path not allowed', ok: false, status: 0 }
  const headers: Record<string, string> = {}
  const auth = request.token ?? config.authorize?.()
  if (auth) headers.authorization = auth
  const init: RequestInit = { credentials: 'include', headers, method: request.method }
  if (request.method === 'POST') {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(request.body ?? {})
  }
  try {
    const res = await fetch(`${config.apiOrigin}${request.path}`, init)
    if (request.binary) return { b64: bytesToB64(new Uint8Array(await res.arrayBuffer())), ok: res.ok, status: res.status }
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { json, ok: res.ok, status: res.status }
  } catch (fetchError) {
    return { error: String(fetchError), ok: false, status: 0 }
  }
}
export type { BridgeMessage, Launch, PingReply, ProxyConfig, ProxyMethod, ProxyReply, ProxyRequest, StashReply, Transport }
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
}
