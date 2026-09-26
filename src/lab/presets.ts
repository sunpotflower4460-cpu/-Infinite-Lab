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
  {
    id: 'pi-two-arm',
    name: 'Pi Two-Arm (reference candidate)',
    description:
      'Two-Arm Rotation: pen traces e^{it} + e^{iπt}, dt = 0.05 — candidate rule for docs/reference',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'two-arm',
      parameters: { dt: 0.05, r1: 1, r2: 1, scale: 100 },
    },
  },
  {
    id: 'pi-film',
    name: 'π Film (reference video look)',
    description:
      'Two-Arm Rotation e^{it} + e^{iπt}, dt = 0.05 — the rule identified in the reference video (arms shown as a guide, never stored)',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'two-arm',
      parameters: { dt: 0.05, r1: 1, r2: 1, scale: 100, drawArms: true },
    },
  },
  {
    id: 'pi-two-arm-torus',
    name: 'Pi Two-Arm 3D: Torus',
    description:
      'Two-arm machine with arm 2 turning π× as fast in the vertical plane (arms 1.3 and 1, dt = 0.05): the pen fills a torus; 3D view',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'two-arm-torus',
      parameters: { dt: 0.05, r1: 1.3, r2: 1, scale: 100, drawArms: true },
    },
  },
  {
    id: 'pi-two-arm-ball',
    name: 'Pi Two-Arm 3D: Ball',
    description:
      'Two-arm machine (speeds 1 and π, dt = 0.05) on a table turning π² times as fast: the pen fills a ball; 3D view',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'two-arm-ball',
      parameters: { dt: 0.05, r1: 1, r2: 1, scale: 100, drawArms: true },
    },
  },
  {
    id: 'pi-two-arm-height',
    name: 'Pi Two-Arm 3D: Height',
    description:
      'The two-arm pen path e^{it} + e^{iπt} (dt = 0.05) lifted by time, z = 100 × 0.01 × t; 3D view',
    config: {
      constant: 'pi',
      precision: 100_000,
      experiment: 'two-arm-height',
      parameters: { dt: 0.05, r1: 1, r2: 1, scale: 100, rise: 0.01 },
    },
  },
  {
    id: 'playground-spec',
    name: 'Playground: spec example',
    description: 'Formula Playground with ANGLE = digit × π / 5, RADIUS = digit × 2, DISTANCE = 5',
    config: {
      constant: 'pi',
      precision: 10_000,
      experiment: 'playground',
      formulas: { angle: 'digit × π / 5', radius: 'digit × 2', distance: '5' },
    },
  },
  {
    id: 'playground-turning',
    name: 'Playground: turning walk',
    description: 'Formula Playground: each digit turns the walker by digit × 36° (angle accumulates)',
    config: {
      constant: 'pi',
      precision: 10_000,
      experiment: 'playground',
      formulas: { angle: '(angle_prev + digit × π / 5) mod 2π', radius: 'digit / 2', distance: '3' },
    },
  },
  {
    id: 'playground-exact-rotation',
    name: 'Playground: C-radian rotation',
    description:
      'Formula Playground: heading (n × C) mod 2π, reduced exactly in BigInt; radius from the digit',
    config: {
      constant: 'pi',
      precision: 10_000,
      experiment: 'playground',
      formulas: { angle: '(n × C) mod 2π', radius: 'digit / 3', distance: '4' },
    },
  },
]

export const PRESETS: Preset[] = RAW.map((p) => ({ ...p, config: parseConfig(p.config) }))
