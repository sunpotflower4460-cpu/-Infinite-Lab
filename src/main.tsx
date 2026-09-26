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

// First impression: the app opens on the π film (with its plain-language explanation).
// A link ending in #lab opens the laboratory directly; closing the film switches to #lab.
if (window.location.hash !== '#lab') getController().startFilm()
