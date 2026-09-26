import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { getController } from './app/LabController'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// A link ending in #film opens straight into Film mode (e.g. from a phone).
if (window.location.hash === '#film') getController().startFilm()
