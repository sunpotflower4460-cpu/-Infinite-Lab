import { useRef } from 'react'
import { getController } from '../../app/LabController'
import { useLab } from '../../state/labStore'

/** JSON export / import (spec §28) with reproduction check of the geometry digest. */
export function FileActions() {
  const c = getController()
  const ready = useLab((s) => s.phase === 'ready')
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="file-actions">
      <button onClick={() => void c.exportJson()} disabled={!ready} title="Reproducible experiment record">
        Export JSON
      </button>
      {(['png', 'svg', 'csv'] as const).map((f) => (
        <button
          key={f}
          onClick={() => void c.exportAs(f)}
          disabled={!ready}
          title={
            f === 'png'
              ? 'Image of the current view'
              : `Geometry up to the Timeline position, exact float64 values (${f.toUpperCase()})`
          }
        >
          {f.toUpperCase()}
        </button>
      ))}
      <button onClick={() => input.current?.click()} title="Load a preset or experiment file">
        Import JSON
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) c.importJson(await file.text())
        }}
      />
      <VerifyBadge />
    </div>
  )
}

function VerifyBadge() {
  const verify = useLab((s) => s.verify)
  switch (verify.status) {
    case 'idle':
      return null
    case 'running':
      return <span className="badge muted">reproducing…</span>
    case 'verified':
      return (
        <span className="badge ok" data-testid="verify" title={`SHA-256 ${verify.actual}`}>
          ✓ reproduced (SHA-256 match)
        </span>
      )
    case 'mismatch':
      return (
        <span
          className="badge bad"
          data-testid="verify"
          title={`expected ${verify.expected}\nactual ${verify.actual}`}
        >
          ✗ geometry differs from the file{verify.note ? ` — ${verify.note}` : ''}
        </span>
      )
    case 'error':
      return (
        <span className="badge bad" data-testid="verify">
          import failed: {verify.message}
        </span>
      )
  }
}
