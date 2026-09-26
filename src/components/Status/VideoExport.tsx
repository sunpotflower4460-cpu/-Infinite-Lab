import { useState } from 'react'
import { getController } from '../../app/LabController'
import { webCodecsAvailable, type VideoFormat, type VideoPace } from '../../lab/video'
import { useLab } from '../../state/labStore'
import { formatInt } from '../../utils/format'
import { useDefinition } from '../useDefinition'

/** iPhone / iPad Safari plays MP4 (H.264) best; elsewhere MP4 is the safe default too. */
const DEFAULT_FORMAT: VideoFormat = 'mp4'

/**
 * Video export (spec §28): records the drawing of the shown steps as MP4 / WebM. Which step
 * each frame shows is deterministic; the encoded bytes depend on the device's encoder.
 */
export function VideoExport() {
  const c = getController()
  const ready = useLab((s) => s.phase === 'ready' && s.currentStep > 0)
  const video = useLab((s) => s.video)
  const microscope = useLab((s) => s.microscope)
  const upTo = useLab((s) => s.viewStep ?? s.currentStep)
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<VideoFormat>(DEFAULT_FORMAT)
  const [seconds, setSeconds] = useState(10)
  const [pace, setPace] = useState<VideoPace>('linear')
  const [glow, setGlow] = useState(false)
  const is3d = useDefinition().view === '3d'
  const supported = webCodecsAvailable()
  const recording = video.status === 'recording'

  return (
    <div className="video-export">
      <button
        onClick={() => setOpen(!open)}
        disabled={!supported || is3d}
        className={open && !is3d ? 'active' : ''}
        title={
          is3d
            ? 'Video export is not available in the 3D view yet (PNG, SVG, CSV and JSON are)'
            : supported
              ? 'Record the drawing as a video'
              : 'This browser has no WebCodecs video encoder'
        }
        aria-expanded={open}
      >
        Video
      </button>
      {open && !is3d && (
        <div className="video-panel" data-testid="video-panel" role="dialog" aria-label="Video export">
          <div className="muted small">
            Steps {formatInt(microscope?.from ?? 1)}–{formatInt(microscope?.to ?? upTo)}
            {microscope ? ' (Microscope range)' : ''}
          </div>
          <label>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as VideoFormat)}
              aria-label="Video format"
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
            </select>
          </label>
          <label>
            Length
            <select
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              aria-label="Video length"
            >
              {[2, 10, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} s
                </option>
              ))}
            </select>
          </label>
          <label>
            Pace
            <select
              value={pace}
              onChange={(e) => setPace(e.target.value as VideoPace)}
              aria-label="Video pace"
            >
              <option value="linear">steady</option>
              <option value="film">accelerating (like the film)</option>
            </select>
          </label>
          <label className="video-check">
            <input type="checkbox" checked={glow} onChange={(e) => setGlow(e.target.checked)} /> Glow look
          </label>
          {recording ? (
            <div className="video-progress">
              <progress value={video.done} max={video.total} />
              <button onClick={() => c.cancelVideo()}>Cancel</button>
            </div>
          ) : (
            <button
              className="primary"
              disabled={!ready}
              onClick={() => void c.exportVideo({ format, seconds, pace, glow })}
            >
              Record
            </button>
          )}
          <VideoStatus />
          <p className="muted small">
            Which step each frame shows is deterministic; the compressed bytes depend on this device’s
            encoder. For exact reproduction use Export JSON.
          </p>
        </div>
      )}
    </div>
  )
}

export function VideoStatus() {
  const video = useLab((s) => s.video)
  if (video.status === 'done')
    return (
      <span className="badge ok" data-testid="video-status">
        saved {video.name} ({video.codec}, {formatInt(Math.round(video.bytes / 1024))} KB)
      </span>
    )
  if (video.status === 'error')
    return (
      <span className="badge bad" data-testid="video-status">
        video failed: {video.message}
      </span>
    )
  if (video.status === 'recording')
    return (
      <span className="badge" data-testid="video-status">
        recording {video.done} / {video.total}
      </span>
    )
  return null
}
