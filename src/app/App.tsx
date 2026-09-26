import { getController } from './LabController'
import { useLab } from '../state/labStore'
import { LabCanvas } from '../components/Canvas/LabCanvas'
import { CompareToggle } from '../components/Compare/CompareToggle'
import { Controls } from '../components/Controls/Controls'
import { DigitStream } from '../components/DigitStream/DigitStream'
import { FormulaViewer } from '../components/FormulaViewer/FormulaViewer'
import { Inspector } from '../components/Inspector/Inspector'
import { ObserverPanel } from '../components/Observer/ObserverPanel'
import { ExperimentPanel } from '../components/Panel/ExperimentPanel'
import { StatusStrip } from '../components/Status/StatusStrip'
import { FileActions } from '../components/Status/FileActions'

export function App() {
  const scientific = useLab((s) => s.scientific)
  const error = useLab((s) => s.error)
  const c = getController()
  const comparing = useLab((s) => s.compareConstant !== null)
  const peer = comparing ? c.peer : null
  const sheet = useLab((s) => s.sheet)
  const film = useLab((s) => s.film)
  const close = () => useLab.setState({ sheet: null })
  return (
    <div className="lab" data-sheet={sheet ?? 'none'} data-film={film ? 'on' : 'off'}>
      <header className="topbar">
        <h1>
          <span className="accent">π</span> Infinite Lab
        </h1>
        <span className="tagline muted">computation → digits → rule → geometry</span>
        <button
          className="film-open"
          onClick={() => c.startFilm()}
          title="Full-screen, like the reference video"
        >
          ▶ Film
        </button>
        <CompareToggle />
        <FileActions />
        <label className="toggle">
          <input type="checkbox" checked={scientific} onChange={(e) => c.setScientific(e.target.checked)} />
          Scientific Mode
        </label>
      </header>
      <aside className="left" aria-label="Setup">
        <SheetHeader title="Setup" onClose={close} />
        <ExperimentPanel />
      </aside>
      <main className="center">
        <div className="lanes">
          <LabCanvas />
          {peer && <LabCanvas controller={peer} lane={1} />}
        </div>
      </main>
      <aside className="right" aria-label="Inspector">
        <SheetHeader title="Inspector" onClose={close} />
        <Inspector />
        <ObserverPanel />
      </aside>
      {/* pointerdown, not click: the click that follows a tap must not close a sheet the tap opened */}
      {sheet && <div className="sheet-backdrop mobile-only" onPointerDown={close} />}
      <footer className="bottom">
        <div className="mobile-bar mobile-only">
          <button
            className={sheet === 'setup' ? 'active' : ''}
            onClick={() => useLab.setState({ sheet: sheet === 'setup' ? null : 'setup' })}
          >
            ⚙ Setup
          </button>
          <button
            className={sheet === 'inspector' ? 'active' : ''}
            onClick={() => useLab.setState({ sheet: sheet === 'inspector' ? null : 'inspector' })}
          >
            ⓘ Inspector
          </button>
        </div>
        <Controls />
        <StatusStrip />
        <DigitStream />
        <div className="bottom-formula">
          <FormulaViewer compact source="current" />
        </div>
        {error && <div className="error">Error: {error}</div>}
      </footer>
    </div>
  )
}

/** Header of a panel when it is shown as a bottom sheet (narrow screens only). */
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="sheet-header mobile-only">
      <span className="sheet-handle" />
      <button onClick={onClose} aria-label={`Close ${title}`}>
        ✕
      </button>
    </div>
  )
}
