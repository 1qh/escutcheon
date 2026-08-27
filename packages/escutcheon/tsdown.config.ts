import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  deps: { neverBundle: ['bun'] },
  dts: true,
  entry: ['src/index.ts', 'src/launch.ts', 'src/opener.ts', 'src/proxy.ts'],
  format: 'esm',
  outDir: 'dist'
})
