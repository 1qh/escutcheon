import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/launch.ts', 'src/proxy.ts', 'src/opener.ts'],
  format: 'esm',
  outDir: 'dist'
})
