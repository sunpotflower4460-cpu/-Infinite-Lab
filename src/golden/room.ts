import { create } from 'zustand'

/**
 * Full-screen pages over the lab, like the film (#film): the "φ and π" room (#golden) and the
 * rhythm textbook (#rhythm). The address is the room's id.
 */
export type RoomId = 'golden' | 'rhythm'
export const ROOMS: RoomId[] = ['golden', 'rhythm']

export const useRoom = create<{ open: RoomId | null }>(() => ({ open: null }))

/** The room a URL hash names (null: none). */
export const roomOfHash = (hash: string): RoomId | null => ROOMS.find((r) => hash === `#${r}`) ?? null

/**
 * How many rooms were opened in the app to reach this history entry. It is kept in the entry itself
 * (history.state), so it stays right when the browser's Back / Forward buttons are used.
 */
const depth = (): number => {
  const d = (window.history.state as { roomDepth?: unknown } | null)?.roomDepth
  return typeof d === 'number' ? d : 0
}

/** Open a room (a history entry, so Back returns to where it was opened from: the lab or a room). */
export function openRoom(id: RoomId = 'golden'): void {
  if (window.location.hash === `#${id}`) return
  const d = depth() + 1
  window.location.hash = `#${id}`
  window.history.replaceState({ ...(window.history.state as object | null), roomDepth: d }, '', `#${id}`)
}

/**
 * Close the room: go back to the entry it was opened from (so Back afterwards does not reopen it);
 * a room reached by a link goes to #lab.
 */
export function closeRoom(): void {
  if (depth() > 0) window.history.back()
  else window.location.hash = '#lab'
}
