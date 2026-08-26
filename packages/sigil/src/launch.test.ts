import { expect, test } from 'bun:test'
import { mintToken, verifyToken } from './launch'

const secret = 'a-shared-backend-secret'
const claims = { documentId: 'doc-42', userId: 'u-7' }
test('a minted token verifies back to its exact claims', () => {
  const token = mintToken({ claims, ttlSec: 300 }, secret)
  expect(verifyToken(token, secret)).toEqual(claims)
})
test('a token forged with a different secret is refused (control)', () => {
  const token = mintToken({ claims, ttlSec: 300 }, secret)
  expect(() => verifyToken(token, 'the-wrong-secret')).toThrow('signature invalid')
})
test('a token whose payload is tampered no longer verifies (control)', () => {
  const token = mintToken({ claims, ttlSec: 300 }, secret)
  const [, mac] = token.split('.')
  const forgedPayload = Buffer.from(JSON.stringify({ c: { userId: 'attacker' }, exp: 9_999_999_999 })).toString(
    'base64url'
  )
  expect(() => verifyToken(`${forgedPayload}.${mac ?? ''}`, secret)).toThrow('signature invalid')
})
test('an expired token is refused (control)', () => {
  const mintedAt = 1_000_000_000_000
  const token = mintToken({ claims, nowMs: mintedAt, ttlSec: 60 }, secret)
  expect(() => verifyToken(token, secret, mintedAt + 61_000)).toThrow('expired')
})
test('an empty secret is refused rather than signing with nothing', () => {
  expect(() => mintToken({ claims, ttlSec: 300 }, '')).toThrow('secret is empty')
})
test('a malformed token is refused', () => {
  expect(() => verifyToken('not-a-token', secret)).toThrow('malformed')
})
