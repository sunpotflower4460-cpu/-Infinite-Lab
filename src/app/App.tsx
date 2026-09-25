import { getController } from './LabController'
import { useLab } from '../state/labStore'
import { LabCanvas } from '../components/Canvas/LabCanvas'
import { CompareToggle } from '../components/Compare/CompareToggle'
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
  const comparing = useLab((s) => s.compareConstant !== null)
  const peer = comparing ? c.peer : null
  return (
    <div className="lab">
      <header className="topbar">
        <h1>
          <span className="accent">π</span> Infinite Lab
        </h1>
        <span className="tagline muted">computation → digits → rule → geometry</span>
        <CompareToggle />
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
        <div className="lanes">
          <LabCanvas />
          {peer && <LabCanvas controller={peer} lane={1} />}
        </div>
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
