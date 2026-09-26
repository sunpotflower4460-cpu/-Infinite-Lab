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

// Typing #film / #lab into the address bar (or going back to such a URL) switches the screen too.
// The app itself changes the hash with replaceState, which fires no hashchange, so no loop.
window.addEventListener('hashchange', () => {
  const c = getController()
  const film = c.store.getState().film
  if (window.location.hash === '#lab' && film) c.stopFilm()
  else if (window.location.hash === '#film' && !film) c.startFilm()
})
