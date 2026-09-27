import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { getController } from './app/LabController'
import { roomOfHash, useRoom } from './golden/room'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// First impression: the app opens on the π film (with its plain-language explanation).
// A link ending in #lab opens the laboratory directly; closing the film switches to #lab;
// #golden / #rhythm open a room (the "φ and π" room, the rhythm textbook) over the lab.
const startRoom = roomOfHash(window.location.hash)
if (startRoom) useRoom.setState({ open: startRoom })
else if (window.location.hash !== '#lab') getController().startFilm()

// Typing #film / #lab / #golden / #rhythm into the address bar (or going back to such a URL) switches the
// screen too. The app itself changes the hash with replaceState, which fires no hashchange.
window.addEventListener('hashchange', () => {
  const c = getController()
  const film = c.store.getState().film
  const hash = window.location.hash
  const room = roomOfHash(hash)
  if (room) {
    if (film) {
      c.stopFilm() // it marks the URL #lab; the room keeps its own address
      window.history.replaceState(window.history.state, '', hash)
    }
    c.pause()
    useRoom.setState({ open: room })
    return
  }
  useRoom.setState({ open: null })
  if (hash === '#lab' && film) c.stopFilm()
  else if (hash === '#film' && !film) c.startFilm()
})
