/**
 * Canvases that keep no picture between frames (WebGL without preserveDrawingBuffer) register
 * how to picture them for the AI Guide's pen. Kept apart from capture.ts so registering does
 * not load the capture code (html-to-image) until a picture is actually taken.
 */
export const snapshots = new Map<HTMLCanvasElement, () => HTMLCanvasElement | null>()

export function registerCanvasSnapshot(
  canvas: HTMLCanvasElement,
  fn: () => HTMLCanvasElement | null,
): () => void {
  snapshots.set(canvas, fn)
  return () => {
    if (snapshots.get(canvas) === fn) snapshots.delete(canvas)
  }
}
