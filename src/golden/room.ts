import { create } from 'zustand'

/** The "φ and π" room: a full-screen page over the lab (#golden), like the film (#film). */
export const useRoom = create<{ open: boolean }>(() => ({ open: false }))

let openedFromLab = false

/** Open the room (a history entry, so Back returns to the lab). */
export function openRoom(): void {
  openedFromLab = true
  window.location.hash = '#golden'
}

/**
 * Close the room: go back to the lab's history entry when the room was opened from the lab
 * (so Back afterwards does not reopen it); otherwise (opened by a #golden link) go to #lab.
 */
export function closeRoom(): void {
  if (openedFromLab) {
    openedFromLab = false
    window.history.back()
  } else window.location.hash = '#lab'
}
