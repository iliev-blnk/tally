export type Box = { x1: number; y1: number; x2: number; y2: number }

export type Kind = 'car' | 'bus' | 'truck' | 'motorcycle' | 'bicycle' | 'person'

export type Group = 'vehicle' | 'person'

export type Detection = Box & { kind: Kind; score: number }
