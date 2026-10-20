import type { Plugin } from 'vite'

// ONNX Runtime loads its wasm glue with a dynamic import() from /ort/. In dev, Vite tags that
// request with ?import and refuses to serve a public file as a module, so strip the tag. In a
// build, drop the copy of the wasm Vite emits from ORT's own URL reference: /ort/ serves it.
export function ortRuntime(): Plugin {
  return {
    name: 'tally-ort-runtime',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.includes('/ort/')) req.url = req.url.replace(/\?import$/, '')
        next()
      })
    },
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (name.endsWith('.wasm')) delete bundle[name]
    },
  }
}
