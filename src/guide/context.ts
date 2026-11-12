import { useEffect } from 'react'

/**
 * What a page tells the AI Guide about itself. Any screen (the lab, a room, future rooms) can
 * take part without touching the guide:
 *
 *   - register state with useGuideContext('my-room', () => ({ page: '…', … })) while it is shown;
 *   - mark a topic with data-guide-title="…" (the circled area's place), its one-line summary
 *     with data-guide-summary, and live controls (slider values, …) with data-guide-state —
 *     these are sent even when they lie outside the circle;
 *   - mark UI that must never be read or captured with data-guide-ignore.
 */

type Provider = () => Record<string, unknown> | null
const providers = new Map<string, Provider>()

export function registerGuideContext(id: string, provider: Provider): () => void {
  providers.set(id, provider)
  return () => {
    if (providers.get(id) === provider) providers.delete(id)
  }
}

/** Register while the component is mounted. The provider is read at question time. */
export function useGuideContext(id: string, provider: Provider): void {
  useEffect(() => registerGuideContext(id, provider), [id, provider])
}

export function collectState(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [id, p] of providers) {
    try {
      const v = p()
      if (v) out[id] = v
    } catch {
      // a page that cannot describe itself right now is simply left out
    }
  }
  return out
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

const intersects = (a: DOMRect | Rect, b: Rect) =>
  a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom

const MAX_TEXT = 4000

/** Visible text inside the rectangle (viewport coordinates), in reading order, de-duplicated. */
export function textInRect(rect: Rect, root: ParentNode = document.body): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let size = 0
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (!t || seen.has(t) || size > MAX_TEXT) return
    seen.add(t)
    out.push(t)
    size += t.length
  }
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n instanceof Element) {
        if (n.closest('[data-guide-ignore]')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_SKIP
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n instanceof Text) || !n.data.trim()) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0 && intersects(r, rect)) {
        push(n.data)
        break
      }
    }
  }
  // pictures have no text: name them by their label (canvas, svg with role="img")
  for (const el of (root as Element).querySelectorAll?.(
    'canvas[aria-label], svg[aria-label], [role="img"][aria-label]',
  ) ?? []) {
    if (!el.closest('[data-guide-ignore]') && intersects(el.getBoundingClientRect(), rect))
      push(`［図：${el.getAttribute('aria-label')}］`)
  }
  return out
}

/** The place of the circled area: page titles and the topic it lies in, plus that topic's state. */
export function placeOf(rect: Rect): { place: string; topic: Record<string, unknown> } {
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
  const hit = document.elementsFromPoint(cx, cy).find((e) => !e.closest('[data-guide-ignore]'))
  const titles: string[] = []
  const topic: Record<string, unknown> = {}
  for (let el: Element | null = hit ?? null; el; el = el.parentElement) {
    const t = el.getAttribute('data-guide-title')
    if (!t) continue
    titles.unshift(t)
    if (!('summary' in topic)) {
      const s = el.querySelector('[data-guide-summary]')?.textContent?.replace(/\s+/g, ' ').trim()
      if (s) topic.summary = s
      const states = [...el.querySelectorAll('[data-guide-state]')]
        .map((e) => e.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      if (states.length) topic.controls = states
    }
  }
  return { place: titles.join(' › '), topic }
}
