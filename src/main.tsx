import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { getController } from './app/LabController'
import { useRoom } from './golden/room'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// First impression: the app opens on the π film (with its plain-language explanation).
// A link ending in #lab opens the laboratory directly; closing the film switches to #lab;
// #golden opens the "φ and π" room over the lab.
if (window.location.hash === '#golden') useRoom.setState({ open: true })
else if (window.location.hash !== '#lab') getController().startFilm()

// Typing #film / #lab / #golden into the address bar (or going back to such a URL) switches the
// screen too. The app itself changes the hash with replaceState, which fires no hashchange.
window.addEventListener('hashchange', () => {
  const c = getController()
  const film = c.store.getState().film
  const hash = window.location.hash
  if (hash === '#golden') {
    if (film) {
      c.stopFilm() // it marks the URL #lab; the room keeps #golden
      window.history.replaceState(window.history.state, '', '#golden')
    }
    c.pause()
    useRoom.setState({ open: true })
    return
  }
  useRoom.setState({ open: false })
  if (hash === '#lab' && film) c.stopFilm()
  else if (hash === '#film' && !film) c.startFilm()
})
