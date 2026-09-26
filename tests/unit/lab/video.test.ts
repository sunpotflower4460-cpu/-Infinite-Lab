import { describe, expect, it } from 'vitest'
import { frameSteps, videoSize } from '../../../src/lab/video'

describe('video frames', () => {
  it('steady pace: evenly spaced steps from `from` to `to`', () => {
    expect(frameSteps(1, 101, 5, 'linear')).toEqual([1, 26, 51, 76, 101])
    const s = frameSteps(1, 1000, 300, 'linear')
    expect(s).toHaveLength(300)
    expect(s[0]).toBe(1)
    expect(s.at(-1)).toBe(1000)
  })

  it('film pace: non-decreasing, slow at first, ends exactly at `to`', () => {
    const s = frameSteps(1, 20_000, 600, 'film')
    expect(s).toHaveLength(600)
    expect(s[0]).toBe(1)
    expect(s.at(-1)).toBe(20_000)
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!)
    // the first half of the video shows far fewer steps than the second
    expect(s[299]! - s[0]!).toBeLessThan((s[599]! - s[299]!) / 4)
  })

  it('handles a range of one step and a reversed range', () => {
    expect(frameSteps(7, 7, 3, 'film')).toEqual([7, 7, 7])
    expect(frameSteps(10, 1, 4, 'linear')).toEqual([1, 4, 7, 10])
    expect(frameSteps(1, 10, 0, 'linear')).toEqual([10])
  })

  it('video size: even, at most 1920 on the long side, aspect kept', () => {
    expect(videoSize(781, 1381)).toEqual({ width: 780, height: 1380 })
    const big = videoSize(3840, 2160)
    expect(big).toEqual({ width: 1920, height: 1080 })
    expect(videoSize(1, 1)).toEqual({ width: 2, height: 2 })
  })
})

describe('video bitrate', () => {
  it('about 0.2 bit per pixel and frame, clamped to 2–16 Mbit/s', async () => {
    const { videoBitrate } = await import('../../../src/lab/video')
    expect(videoBitrate(1280, 720, 30)).toBe(Math.round(1280 * 720 * 30 * 0.2))
    expect(videoBitrate(320, 240, 30)).toBe(2e6)
    expect(videoBitrate(3840, 2160, 60)).toBe(16e6)
  })
})
