/// <reference lib="webworker" />
import { CONSTANTS } from '../math/constants'
import type { MathRequest, MathResponse } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<MathRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return
  try {
    const constant = CONSTANTS[msg.constantId]
    if (!constant) throw new Error(`Unknown constant "${msg.constantId}"`)
    const r = await constant.calculate(msg.precision)
    const digits = Uint8Array.from(r.digits, (c) => c.charCodeAt(0) - 48)
    const res: MathResponse = {
      type: 'result',
      requestId: msg.requestId,
      constantId: msg.constantId,
      value: r.value,
      digits,
      precision: r.precision,
      integerPartLength: r.integerPartLength,
      algorithm: r.algorithm,
      computeTimeMs: r.computeTimeMs,
    }
    ctx.postMessage(res, [digits.buffer])
  } catch (err) {
    ctx.postMessage({ type: 'error', requestId: msg.requestId, message: String(err) } satisfies MathResponse)
  }
}
