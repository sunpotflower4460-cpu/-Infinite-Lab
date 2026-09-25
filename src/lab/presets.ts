import { parseConfig, type LabConfig } from './config'

export interface Preset {
  id: string
  name: string
  /** What the preset actually does (the rule), not an aesthetic claim. */
  description: string
  config: LabConfig
}

/**
 * Built-in presets (spec §24). Names are labels only; each description states the rule.
 * Stored in the same JSON shape as exports, e.g.
 *   { "constant": "pi", "experiment": "circle-chain", "parameters": { "radiusScale": 2 } }
 */
const RAW: { id: string; name: string; description: string; config: unknown }[] = [
  {
    id: 'pi-walk',
    name: 'Pi Walk',
    description: 'Digit Circle Walk over 10,000 digits of π',
    config: { constant: 'pi', precision: 10_000, experiment: 'digit-circle-walk', parameters: {} },
  },
  {
    id: 'pi-circle-chain',
    name: 'Pi Circle Chain',
    description: 'Circle Chain with cumulative angles (θ[n] = θ[n−1] + digit/10·2π)',
    config: {
      constant: 'pi',
      precision: 10_000,
      experiment: 'circle-chain',
      parameters: { radiusScale: 2, cumulative: true },
    },
  },
  {
    id: 'pi-flower',
    name: 'Pi Flower',
    description: 'Circle Chain with absolute angles (θ[n] = digit/10·2π) and centre links',
    config: {
      constant: 'pi',
      precision: 10_000,
      experiment: 'circle-chain',
      parameters: { radiusScale: 3, cumulative: false, drawLinks: true },
    },
  },
  {
    id: 'pi-orbit',
    name: 'Pi Orbit',
    description: 'Pi Rotation: turn π° per step, move 5',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'pi-rotation',
      parameters: { modifier: 1, distance: 5 },
    },
  },
  {
    id: 'pi-spiral',
    name: 'Pi Spiral',
    description: 'Pi Rotation: turn 10π° (≈ 31.4159°) per step, move 5',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'pi-rotation',
      parameters: { modifier: 10, distance: 5 },
    },
  },
]

export const PRESETS: Preset[] = RAW.map((p) => ({ ...p, config: parseConfig(p.config) }))
