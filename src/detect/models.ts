export type ModelId = 'yolox_nano' | 'yolox_tiny' | 'yolox_s' | 'dfine_s'

export type ModelInfo = {
  name: string
  family: 'yolox' | 'detr'
  /** Square input side in pixels. */
  size: number
  url: string
}

const YOLOX = 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0'
// The onnx-community D-FINE-n export scores visible cars at ~0.4 and misses large ones, in native
// ONNX Runtime too, so only D-FINE-s is a candidate.
const HF = 'https://huggingface.co/onnx-community'

export const MODELS: Record<ModelId, ModelInfo> = {
  yolox_nano: { name: 'YOLOX-nano', family: 'yolox', size: 416, url: `${YOLOX}/yolox_nano.onnx` },
  yolox_tiny: { name: 'YOLOX-tiny', family: 'yolox', size: 416, url: `${YOLOX}/yolox_tiny.onnx` },
  yolox_s: { name: 'YOLOX-s', family: 'yolox', size: 640, url: `${YOLOX}/yolox_s.onnx` },
  dfine_s: {
    name: 'D-FINE-s',
    family: 'detr',
    size: 640,
    url: `${HF}/dfine_s_coco-ONNX/resolve/main/onnx/model.onnx`,
  },
}

export const MODEL_IDS = Object.keys(MODELS) as ModelId[]

/** Picked by bench/report.ts from the measured accuracy and speed; see the README. */
export const DEFAULT_GPU: ModelId = 'yolox_s'
export const DEFAULT_CPU: ModelId = 'yolox_tiny'
