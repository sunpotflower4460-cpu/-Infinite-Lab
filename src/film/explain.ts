/**
 * What Film mode tells its viewers, computed from the running state. The film draws
 * z(t) = r₁·e^{it} + r₂·e^{iπt} (Two-Arm Rotation, t = n·dt): arm 2 turns π times as fast.
 */

export type FilmInfoLevel = 'simple' | 'expert' | 'off'

const INFO_KEY = 'pi-infinite-lab.film.info'

/** The viewer's last choice (a per-browser convenience; defaults to the plain explanation). */
export function loadFilmInfo(): FilmInfoLevel {
  try {
    const v = globalThis.localStorage?.getItem(INFO_KEY)
    return v === 'expert' || v === 'off' ? v : 'simple'
  } catch {
    return 'simple'
  }
}

export function saveFilmInfo(level: FilmInfoLevel): void {
  try {
    globalThis.localStorage?.setItem(INFO_KEY, level)
  } catch {
    // storage unavailable (private mode): the choice lasts for this visit only
  }
}

export interface FilmNumbers {
  /** Drawing time t = n·dt (radians turned by arm 1). */
  t: number
  /** Full turns of arm 1 (t / 2π) and arm 2 (πt / 2π). */
  turns1: number
  turns2: number
}

export function filmNumbers(step: number, dt: number): FilmNumbers {
  const t = step * dt
  return { t, turns1: t / (2 * Math.PI), turns2: t / 2 }
}

/**
 * Best rational approximations of π (continued-fraction convergents). With arms of equal
 * length and speed ratio p/q the curve closes after q turns of arm 1 and has (p − q)-fold
 * rotational symmetry; since π is close to p/q, the picture almost closes there.
 */
export const PI_CONVERGENTS: readonly { p: number; q: number }[] = [
  { p: 3, q: 1 },
  { p: 22, q: 7 },
  { p: 333, q: 106 },
  { p: 355, q: 113 },
  { p: 103993, q: 33102 },
]

export interface Stage {
  id: 'start' | 'drift' | 'flower' | 'mesh' | 'fill'
  /** Plain-language explanation (Japanese) for the "simple" level. */
  text: string
}

/** The explanation that fits the picture after `turns1` turns of arm 1. */
export function stageFor(turns1: number): Stage {
  if (turns1 < 1)
    return {
      id: 'start',
      text: '2 本の腕をつないで回しています。先の腕は、根元の腕の 3.14159… 倍（円周率 π 倍）の速さで回ります。ペン先が通った跡が線になります。',
    }
  if (turns1 < 7)
    return {
      id: 'drift',
      text: 'π は 3 より少しだけ大きいので、1 周するたびに少しずつずれて、模様がゆっくり回っていきます。',
    }
  if (turns1 < 30)
    return {
      id: 'flower',
      text: '根元の腕が 7 周すると、先の腕は 21.99… 周。π ≈ 22/7 なので、ここでほぼ元の位置に戻り、22 − 7 = 15 枚の花びらが現れます。',
    }
  if (turns1 < 113)
    return {
      id: 'mesh',
      text: 'でも π はどんな分数とも等しくない数（無理数）です。ぴったりは戻らないので、ずれが重なって網目になっていきます。',
    }
  return {
    id: 'fill',
    text: '113 周で、さらに π に近い分数 355/113 = 3.1415929… に届きます。それでも一致はしないので、線は同じ所を通らずに円盤を埋め続けます。',
  }
}
