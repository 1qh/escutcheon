/* oxlint-disable promise/prefer-await-to-then, promise/always-return */
import { z } from 'zod'
import type { ProxyConfig, ProxyReply, Transport } from './proxy'
import { handleProxy, proxyReplySchema, proxyRequestSchema } from './proxy'
/** The opener-tab transport — the native bridge, needing no browser extension.
 *
 * When the host app opens the tool with `window.open`, the tool holds a `window.opener` handle to the
 * host tab, which runs on the host's own origin and carries the user's session. `openerTransport` is the
 * TOOL end: it postMessages each proxy request to the opener and resolves the correlated reply.
 * `serveOpener` is the HOST end: a small script the host loads runs the message listener, calls
 * `handleProxy` (which fetches the host API with the user's session), and posts the reply back. Neither
 * end holds a server-side credential. Both gate strictly on the counterpart's origin. */
const DEFAULT_TIMEOUT_MS = 30_000
const envelopeSchema = z.object({ id: z.string(), kind: z.literal('proxy'), request: proxyRequestSchema })
const replyEnvelopeSchema = z.object({ id: z.string(), kind: z.literal('proxy-reply'), reply: z.unknown() })
const openerTransport =
  ({ targetOrigin, timeoutMs = DEFAULT_TIMEOUT_MS }: { targetOrigin: string; timeoutMs?: number }): Transport =>
  async request =>
    new Promise<ProxyReply>((resolve, reject) => {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: lib.dom types globalThis.opener as any; narrow it once to the Window we postMessage to
      const opener = globalThis.opener as null | Window
      if (!opener || targetOrigin === '') {
        reject(new Error('no opener to proxy through — open this tool from the host app'))
        return
      }
      const id = globalThis.crypto.randomUUID()
      const onMessage = (event: MessageEvent): void => {
        if (event.origin !== targetOrigin || event.source !== opener) return
        const parsed = replyEnvelopeSchema.safeParse(event.data)
        if (!parsed.success || parsed.data.id !== id) return
        globalThis.removeEventListener('message', onMessage)
        resolve(proxyReplySchema.parse(parsed.data.reply))
      }
      globalThis.addEventListener('message', onMessage)
      globalThis.setTimeout(() => {
        globalThis.removeEventListener('message', onMessage)
        reject(new Error('the host tab did not answer — keep it open'))
      }, timeoutMs)
      opener.postMessage({ id, kind: 'proxy', request }, targetOrigin)
    })
const serveOpener = (config: ProxyConfig & { toolOrigin: string }): (() => void) => {
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== config.toolOrigin) return
    const parsed = envelopeSchema.safeParse(event.data)
    if (!parsed.success) return
    const { id, request } = parsed.data
    const { source } = event
    handleProxy(request, config)
      .then(reply => {
        // biome-ignore lint/nursery/noUnsafeTypeAssertion: a MessageEvent source that reached us is the opener Window we reply to
        if (source) (source as Window).postMessage({ id, kind: 'proxy-reply', reply }, config.toolOrigin)
      })
      .catch(() => undefined)
  }
  globalThis.addEventListener('message', onMessage)
  return () => globalThis.removeEventListener('message', onMessage)
}
export { openerTransport, serveOpener }
