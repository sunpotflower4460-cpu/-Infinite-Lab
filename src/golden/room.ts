import { create } from 'zustand'

/** The "φ and π" room: a full-screen page over the lab (#golden), like the film (#film). */
export const useRoom = create<{ open: boolean }>(() => ({ open: false }))

/** Open the room (a history entry, so Back returns to the lab). */
export function openRoom(): void {
  window.location.hash = '#golden'
}

export function closeRoom(): void {
  window.location.hash = '#lab'
}
