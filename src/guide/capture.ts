import { toCanvas } from 'html-to-image'
import type { Rect } from './context'
import { snapshots } from './snapshots'

export { registerCanvasSnapshot } from './snapshots'

/**
 * A picture of the circled area, for models that read images.
 *
 * The page is rendered with html-to-image, but <canvas> elements are drawn separately: a WebGL
 * canvas only holds its picture right after a frame, so each canvas is first copied at once —
 * through a registered snapshot function (e.g. the lab's 2D renderer renders on demand) or
 * directly (2D canvases and the 3D view, which preserves its buffer).
 */

const MAX_SIDE = 1024

export async function captureRect(
  rect: Rect,
  stroke: { x: number; y: number }[],
  background = '#04050a',
): Promise<string | null> {
  const width = Math.max(1, Math.round(rect.right - rect.left))
  const height = Math.max(1, Math.round(rect.bottom - rect.top))
  const container = containerOf(rect)
  const box = container.getBoundingClientRect()

  // 1. copy every canvas in the area now, before anything is re-rendered
  const frozen: { rect: DOMRect; image: HTMLCanvasElement }[] = []
  for (const c of container.querySelectorAll('canvas')) {
    if (c.closest('[data-guide-ignore]')) continue
    const r = c.getBoundingClientRect()
    if (!(r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom)) continue
    try {
      const src = snapshots.get(c)?.() ?? c
      const copy = document.createElement('canvas')
      copy.width = src.width
      copy.height = src.height
      copy.getContext('2d')?.drawImage(src, 0, 0)
      frozen.push({ rect: r, image: copy })
    } catch {
      // a canvas that cannot be read is left out of the picture (its label is still sent as text)
    }
  }

  // 2. the rest of the page
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  let page: HTMLCanvasElement | null
  try {
    page = await toCanvas(container as HTMLElement, {
      pixelRatio: 1,
      backgroundColor: background,
      skipFonts: true,
      cacheBust: false,
      filter: (n) =>
        !(n instanceof HTMLCanvasElement) && !(n instanceof Element && n.hasAttribute('data-guide-ignore')),
    })
  } catch {
    page = null // the canvases alone still make a useful picture
  }

  // 3. crop, overlay the canvases, draw the viewer's stroke
  const out = document.createElement('canvas')
  out.width = Math.round(width * scale)
  out.height = Math.round(height * scale)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = background
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.scale(scale, scale)
  if (page) ctx.drawImage(page, box.left - rect.left, box.top - rect.top, box.width, box.height)
  for (const f of frozen)
    ctx.drawImage(f.image, f.rect.left - rect.left, f.rect.top - rect.top, f.rect.width, f.rect.height)
  if (stroke.length > 1) {
    ctx.strokeStyle = 'rgba(255, 199, 102, 0.9)'
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(stroke[0]!.x - rect.left, stroke[0]!.y - rect.top)
    for (const p of stroke.slice(1)) ctx.lineTo(p.x - rect.left, p.y - rect.top)
    ctx.stroke()
  }
  try {
    return out.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * The smallest element that contains the whole area — rendered on its own, which also avoids
 * html-to-image drawing a scrolled container from its top. A scrolled container is replaced by
 * its child that holds the area.
 */
function containerOf(rect: Rect): Element {
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
  const contains = (el: Element) => {
    const r = el.getBoundingClientRect()
    return (
      r.left <= rect.left + 1 &&
      r.top <= rect.top + 1 &&
      r.right >= rect.right - 1 &&
      r.bottom >= rect.bottom - 1
    )
  }
  let el: Element | null =
    document.elementsFromPoint(cx, cy).find((e) => !e.closest('[data-guide-ignore]')) ?? document.body
  while (el && el !== document.body && !contains(el)) el = el.parentElement
  el = el ?? document.body
  // a circle inside a picture: render its parent, so the canvas itself is among the ones copied
  while (el instanceof HTMLCanvasElement || el instanceof SVGElement) el = el.parentElement ?? document.body
  // a scrolled container would be drawn from its top: use its child holding the area instead
  while (el.scrollTop > 0 || el.scrollLeft > 0) {
    const child: Element | undefined = [...el.children].find(contains)
    if (!child) break
    el = child
  }
  return el === document.documentElement ? document.body : el
}
