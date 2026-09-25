import { getController } from './LabController'
import { useLab } from '../state/labStore'
import { LabCanvas } from '../components/Canvas/LabCanvas'
import { Controls } from '../components/Controls/Controls'
import { DigitStream } from '../components/DigitStream/DigitStream'
import { FormulaViewer } from '../components/FormulaViewer/FormulaViewer'
import { Inspector } from '../components/Inspector/Inspector'
import { ExperimentPanel } from '../components/Panel/ExperimentPanel'
import { StatusStrip } from '../components/Status/StatusStrip'
import { FileActions } from '../components/Status/FileActions'

export function App() {
  const scientific = useLab((s) => s.scientific)
  const error = useLab((s) => s.error)
  const c = getController()
  return (
    <div className="lab">
      <header className="topbar">
        <h1>
          <span className="accent">π</span> Infinite Lab
        </h1>
        <span className="tagline muted">computation → digits → rule → geometry</span>
        <FileActions />
        <label className="toggle">
          <input type="checkbox" checked={scientific} onChange={(e) => c.setScientific(e.target.checked)} />
          Scientific Mode
        </label>
      </header>
      <aside className="left">
        <ExperimentPanel />
      </aside>
      <main className="center">
        <LabCanvas />
      </main>
      <aside className="right">
        <Inspector />
      </aside>
      <footer className="bottom">
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
