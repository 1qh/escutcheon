import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
/** A signed, expiring launch token that carries a visitor's entitlement across a separate origin.
 *
 * When a host app opens a tool on its OWN origin (a new tab, a separate deployment), a cookie does not
 * travel cross-site, so the tool cannot tell who the visitor is or what they may open. The token does:
 * the host mints it with the claims that matter (who, and which resource) plus an expiry, signs it with a
 * secret only the two backends share, and hands it to the tool in the URL; the tool's backend verifies
 * the signature and the expiry and reads the claims back. It is a bearer credential for exactly its claims
 * until it expires, which is why the expiry is mandatory and short.
 *
 * The claims are an arbitrary string map, so a caller names them however its domain does (a user id, a
 * document id, a tenant). The signature is HMAC-SHA256 over the base64url payload and compared in constant
 * time; an empty secret is refused rather than signing with nothing. */
type Claims = Record<string, string>
const payloadSchema = z.object({ c: z.record(z.string(), z.string()), exp: z.number() })
const sign = (data: string, secret: string): string => createHmac('sha256', secret).update(data).digest('base64url')
const requireSecret = (secret: string): string => {
  if (secret.length === 0) throw new Error('launch token secret is empty')
  return secret
}
const mintToken = (
  { claims, nowMs = Date.now(), ttlSec }: { claims: Claims; nowMs?: number; ttlSec: number },
  secret: string
): string => {
  requireSecret(secret)
  const exp = Math.floor(nowMs / 1000) + ttlSec
  const payload = Buffer.from(JSON.stringify({ c: claims, exp })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}
const verifyToken = (token: string, secret: string, nowMs = Date.now()): Claims => {
  requireSecret(secret)
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('launch token malformed')
  const [payload, mac] = parts
  const expected = sign(payload, secret)
  const macBuf = Buffer.from(mac, 'base64url')
  const expectedBuf = Buffer.from(expected, 'base64url')
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf))
    throw new Error('launch token signature invalid')
  const parsed = payloadSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  if (parsed.exp * 1000 < nowMs) throw new Error('launch token expired')
  return parsed.c
}
export type { Claims }
export { mintToken, verifyToken }
