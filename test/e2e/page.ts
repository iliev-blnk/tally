import { DetectorClient } from '../../src/detect/client'
import type { ModelId } from '../../src/detect/models'
import type { Backend } from '../../src/detect/session'

// Runs one detection on the fixture frame and exposes the result to the test.
declare global {
  interface Window {
    runDetect(model: ModelId, ep: Backend): Promise<unknown>
  }
}

window.runDetect = async (model, ep) => {
  const blob = await (await fetch('/test/fixtures/detrac.jpg')).blob()
  const client = await DetectorClient.create({ model, ep, baseUrl: '/' })
  try {
    const { dets, ms } = await client.detect(await createImageBitmap(blob), 0.3)
    return { ep: client.ep, adapter: client.adapter, dets, ms }
  } finally {
    client.dispose()
  }
}
