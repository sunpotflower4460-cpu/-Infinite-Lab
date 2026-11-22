import { create } from 'zustand'

export const useDreamRoom = create<{ open: boolean }>(() => ({ open: false }))
let openedFromLab = false
export function openDreamRoom(): void {
  openedFromLab = true
  window.location.hash = '#dream'
}
export function closeDreamRoom(): void {
  if (openedFromLab) {
    openedFromLab = false
    window.history.back()
  } else window.location.hash = '#lab'
}
