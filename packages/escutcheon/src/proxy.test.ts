import { expect, test } from 'bun:test'
import type { ProxyConfig } from './proxy'
import { handleProxy } from './proxy'

const urlOf = (input: Request | string | URL): string => {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return input
}
const allowV1: ProxyConfig['allow'] = path => path.startsWith('/v1/')
const config = (over?: Partial<ProxyConfig>): ProxyConfig => ({
  allow: allowV1,
  apiOrigin: 'https://host.example',
  ...over
})
const withFetch = async <T>(stub: typeof globalThis.fetch, fn: () => Promise<T>): Promise<T> => {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    return await fn()
  } finally {
    globalThis.fetch = original
  }
}
test('a disallowed path is refused WITHOUT any fetch (control: the allowlist gates the credential)', async () => {
  let called = false
  const reply = await withFetch(
    async () => {
      called = true
      return new Response('{}')
    },
    async () => handleProxy({ method: 'GET', path: '/secret/steal' }, config())
  )
  expect(called).toBe(false)
  expect(reply).toEqual({ error: 'path not allowed', ok: false, status: 0 })
})
test('an allowed GET fetches apiOrigin+path with the user session and returns the json', async () => {
  let seenUrl = ''
  let seenCredentials: RequestCredentials | undefined
  const reply = await withFetch(
    async (url, init) => {
      seenUrl = urlOf(url)
      seenCredentials = init?.credentials
      return Response.json({ rows: 2 }, { status: 200 })
    },
    async () => handleProxy({ method: 'GET', path: '/v1/chunk/list' }, config())
  )
  expect(seenUrl).toBe('https://host.example/v1/chunk/list')
  expect(seenCredentials).toBe('include')
  expect(reply).toEqual({ json: { rows: 2 }, ok: true, status: 200 })
})
test('an allowed POST sends a JSON body and the content-type header', async () => {
  let seenBody = ''
  let seenType = ''
  await withFetch(
    async (_url, init) => {
      seenBody = typeof init?.body === 'string' ? init.body : ''
      seenType = new Headers(init?.headers).get('content-type') ?? ''
      return new Response('{}', { status: 200 })
    },
    async () => handleProxy({ body: { doc_id: 'd1' }, method: 'POST', path: '/v1/chunk/set' }, config())
  )
  expect(JSON.parse(seenBody)).toEqual({ doc_id: 'd1' })
  expect(seenType).toBe('application/json')
})
test('a binary request returns base64 rather than json', async () => {
  const reply = await withFetch(
    async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    async () => handleProxy({ binary: true, method: 'GET', path: '/v1/document/get/x' }, config())
  )
  expect(reply.ok).toBe(true)
  expect(reply.b64).toBe(btoa(String.fromCodePoint(1, 2, 3)))
})
test('the tool token authenticates when present; the host authorize hook fills in when the tool has none', async () => {
  let toolHeld = ''
  await withFetch(
    async (_url, init) => {
      toolHeld = new Headers(init?.headers).get('authorization') ?? ''
      return new Response('{}', { status: 200 })
    },
    async () =>
      handleProxy(
        { method: 'GET', path: '/v1/chunk/list', token: 'Bearer tool' },
        config({ authorize: () => 'Bearer host' })
      )
  )
  expect(toolHeld).toBe('Bearer tool')
  let hostInjected = ''
  await withFetch(
    async (_url, init) => {
      hostInjected = new Headers(init?.headers).get('authorization') ?? ''
      return new Response('{}', { status: 200 })
    },
    async () => handleProxy({ method: 'GET', path: '/v1/chunk/list' }, config({ authorize: () => 'Bearer host' }))
  )
  expect(hostInjected).toBe('Bearer host')
  let none: null | string = null
  await withFetch(
    async (_url, init) => {
      none = new Headers(init?.headers).get('authorization')
      return new Response('{}', { status: 200 })
    },
    async () => handleProxy({ method: 'GET', path: '/v1/chunk/list' }, config())
  )
  expect(none).toBeNull()
})
test('a failed fetch is reported as a clean reply, never thrown', async () => {
  const reply = await withFetch(
    async () => {
      throw new Error('network down')
    },
    async () => handleProxy({ method: 'GET', path: '/v1/chunk/list' }, config())
  )
  expect(reply.ok).toBe(false)
  expect(reply.status).toBe(0)
  expect(reply.error).toContain('network down')
})
