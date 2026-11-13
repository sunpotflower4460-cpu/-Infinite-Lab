/// <reference lib="webworker" />
import { KIND, STRIDE } from '../geometry/batch'
import { thirdCircleSample, type ThirdCircleConfig } from '../lab/thirdCircle'

export interface ThirdCircleJob {
  generation: number
  config: ThirdCircleConfig
  data: Float64Array
  count: number
}
export interface ThirdCircleResult {
  generation: number
  data?: Float64Array
  count?: number
  error?: string
}
const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = (event: MessageEvent<ThirdCircleJob>) => {
  const { generation, config, data, count } = event.data
  try {
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE
      if (data[o] !== KIND.point) throw new Error('Third circle needs torus points')
      const q = thirdCircleSample(data[o + 1]!, [data[o + 2]!, data[o + 3]!, data[o + 4]!], config).point
      data.set(q, o + 2)
    }
    ctx.postMessage({ generation, data, count } satisfies ThirdCircleResult, [data.buffer])
  } catch (error) {
    ctx.postMessage({ generation, error: String(error) } satisfies ThirdCircleResult)
  }
}
