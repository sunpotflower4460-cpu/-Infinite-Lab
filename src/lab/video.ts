import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  QUALITY_HIGH,
  WebMOutputFormat,
  type VideoCodec,
} from 'mediabunny'

/**
 * Video export (spec §28): the drawing process as MP4 or WebM, rendered offline frame by
 * frame. Which steps each frame shows is deterministic (frameSteps); the encoded bytes are
 * not — encoders differ between devices — so videos are for watching, JSON is for reproducing.
 */

export type VideoFormat = 'mp4' | 'webm'
/** 'linear': the same number of steps per frame; 'film': slow start, accelerating (Film mode). */
export type VideoPace = 'linear' | 'film'

/** Growth of the 'film' pace over the whole video (e^k − 1 : 1); Film mode's speed grows likewise. */
const FILM_K = 4

/**
 * Step shown by each frame: `frames` values from `from` to `to`, non-decreasing, ending at `to`.
 * The first frame already shows `from` (a video never starts on an empty picture).
 */
export function frameSteps(from: number, to: number, frames: number, pace: VideoPace): number[] {
  const n = Math.max(1, Math.floor(frames))
  const lo = Math.min(from, to)
  const span = Math.max(to, from) - lo
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 1 : i / (n - 1)
    const f = pace === 'film' ? Math.expm1(FILM_K * u) / Math.expm1(FILM_K) : u
    out.push(lo + Math.round(span * f))
  }
  out[n - 1] = lo + span
  return out
}

const CODECS: Record<VideoFormat, VideoCodec[]> = {
  // H.264 first: it plays everywhere, iPhone included
  mp4: ['avc', 'hevc', 'av1', 'vp9'],
  webm: ['vp9', 'vp8', 'av1'],
}

export function webCodecsAvailable(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/** The first codec this browser can encode for the format at this size (null: none). */
export async function pickCodec(
  format: VideoFormat,
  width: number,
  height: number,
): Promise<VideoCodec | null> {
  if (!webCodecsAvailable()) return null
  return getFirstEncodableVideoCodec(CODECS[format], { width, height, quality: QUALITY_HIGH })
}

/** Even dimensions (most encoders need them), at most `maxSide` pixels on the long side. */
export function videoSize(width: number, height: number, maxSide = 1920): { width: number; height: number } {
  const s = Math.min(1, maxSide / Math.max(width, height))
  const even = (x: number) => Math.max(2, Math.floor((x * s) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/**
 * Bits per second for thin bright lines on black: ~0.2 bit per pixel and frame, 2–16 Mbit/s.
 * (Encoders' "high quality" presets assume camera footage and blur 1 px lines away.)
 */
export function videoBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(16e6, Math.max(2e6, width * height * fps * 0.2)))
}

export interface EncodeOptions {
  format: VideoFormat
  fps: number
  width: number
  height: number
  /** Number of frames. */
  frames: number
  /** Draw frame `i` into `ctx` (a canvas of width × height). */
  draw: (i: number, ctx: CanvasRenderingContext2D) => void
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Encode `frames` frames into an MP4 or WebM file. */
export async function encodeVideo(o: EncodeOptions): Promise<{ blob: Blob; codec: VideoCodec }> {
  const codec = await pickCodec(o.format, o.width, o.height)
  if (!codec) throw new Error(`this browser cannot encode ${o.format.toUpperCase()} video`)
  const canvas = document.createElement('canvas')
  canvas.width = o.width
  canvas.height = o.height
  const ctx = canvas.getContext('2d')!
  const target = new BufferTarget()
  const output = new Output({
    format: o.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  })
  const source = new CanvasSource(canvas, {
    codec,
    quality: new Quality({ bitrate: videoBitrate(o.width, o.height, o.fps), bitrateMode: 'variable' }),
    latencyMode: 'quality',
    keyFrameInterval: 2,
  })
  output.addVideoTrack(source, { frameRate: o.fps })
  await output.start()
  try {
    for (let i = 0; i < o.frames; i++) {
      if (o.signal?.aborted) throw new DOMException('video export cancelled', 'AbortError')
      o.draw(i, ctx)
      await source.add(i / o.fps, 1 / o.fps)
      o.onProgress?.(i + 1, o.frames)
      // let the page breathe (progress bar, cancel button)
      if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0))
    }
    await output.finalize()
  } catch (err) {
    await output.cancel().catch(() => {})
    throw err
  }
  const type = o.format === 'mp4' ? 'video/mp4' : 'video/webm'
  return { blob: new Blob([target.buffer!], { type }), codec }
}
